import { GeneralMarketNewsUseCase } from '../../../features/general_market_news/usecase';
import { FmpNewsService } from '../../../features/general_market_news/services/fmp_news_service';
import { FirestoreService } from '../../../features/general_market_news/services/firestore_service';
import { getRemoteConfig, GeneralMarketNewsConfig } from '../../../core/remote-config';
import { GeneralNewsArticle } from '../../../features/general_market_news/models/GeneralNewsArticle';
import { FIRST_RUN_MAX_BACKFILL_PAGES, FIRST_RUN_MAX_PAGES } from '../../../features/general_market_news/constants';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));
jest.mock('../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn()
}));

const WATERMARK = '2026-01-05 12:00:00';

const config: GeneralMarketNewsConfig = {
    pageLimit: 250,
    maxPages: 4,
    maxBackfillPages: 10,
    overlapWindowSeconds: 600,
    runIntervalSeconds: 300
};

const eligibleArticle: GeneralNewsArticle = {
    publishedDate: '2026-01-05 12:30:00',
    publisher: 'Reuters',
    title: 'A headline',
    image: null,
    site: 'reuters.com',
    text: 'Some text',
    url: 'https://news.example.com/1'
};
const secondEligibleArticle: GeneralNewsArticle = {
    ...eligibleArticle,
    publishedDate: '2026-01-05 12:45:00',
    url: 'https://news.example.com/2'
};
const staleArticle: GeneralNewsArticle = {
    ...eligibleArticle,
    publishedDate: '2026-01-05 11:00:00',
    url: 'https://news.example.com/3'
};

const fetchResult = {
    articles: [eligibleArticle],
    pagesFetched: 1,
    reachedOverlap: true,
    maxPublishedDate: '2026-01-05 12:30:00'
};

describe('GeneralMarketNewsUseCase', () => {
    let useCase: GeneralMarketNewsUseCase;
    let mockFmpNewsService: jest.Mocked<FmpNewsService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();

        mockFmpNewsService = {
            fetchSinceWatermark: jest.fn(),
            fetchRange: jest.fn()
        } as unknown as jest.Mocked<FmpNewsService>;

        mockFirestoreService = {
            acquireLease: jest.fn(),
            releaseLease: jest.fn(),
            getCursor: jest.fn(),
            advanceCursor: jest.fn(),
            createNewsIfAbsent: jest.fn()
        } as unknown as jest.Mocked<FirestoreService>;

        (getRemoteConfig as jest.Mock).mockResolvedValue({ general_market_news: config });
        mockFirestoreService.acquireLease.mockResolvedValue(true);
        mockFirestoreService.releaseLease.mockResolvedValue(undefined);
        mockFirestoreService.getCursor.mockResolvedValue(WATERMARK);
        mockFirestoreService.advanceCursor.mockResolvedValue(undefined);
        mockFirestoreService.createNewsIfAbsent.mockResolvedValue(true);
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(fetchResult);

        useCase = new GeneralMarketNewsUseCase(mockFmpNewsService, mockFirestoreService);
    });

    it('execute_leaseNotAcquired_skipsPipeline', async () => {
        // Arrange
        mockFirestoreService.acquireLease.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).not.toHaveBeenCalled();
    });

    it('execute_leaseAcquireThrows_returnsWithoutRunningPipeline', async () => {
        // Arrange
        mockFirestoreService.acquireLease.mockRejectedValue(new Error('txn aborted'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).not.toHaveBeenCalled();
    });

    it('execute_leaseAcquiredHappyPath_storesArticlesAndAdvancesCursor', async () => {
        // Arrange
        mockFirestoreService.getCursor.mockResolvedValue(WATERMARK);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).toHaveBeenCalledWith(eligibleArticle);
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 12:30:00');
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_firstRun_usesFirstRunPagingAndReleasesLease', async () => {
        // Arrange
        mockFirestoreService.getCursor.mockResolvedValue(null);
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue({
            articles: [],
            pagesFetched: 1,
            reachedOverlap: true,
            maxPublishedDate: WATERMARK
        });

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                maxPages: FIRST_RUN_MAX_PAGES,
                maxBackfillPages: FIRST_RUN_MAX_BACKFILL_PAGES
            })
        );
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_fetchFails_skipsStoreAndCursorAdvance', async () => {
        // Arrange
        mockFmpNewsService.fetchSinceWatermark.mockRejectedValue(new Error('fmp down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_writeFailure_skipsCursorAdvance', async () => {
        // Arrange
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue({
            articles: [eligibleArticle, secondEligibleArticle],
            pagesFetched: 1,
            reachedOverlap: true,
            maxPublishedDate: '2026-01-05 12:45:00'
        });
        mockFirestoreService.createNewsIfAbsent
            .mockResolvedValueOnce(true)
            .mockRejectedValueOnce(new Error('write failed'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.advanceCursor).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_articleBeforeOverlapCutoff_isNotStored', async () => {
        // Arrange
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue({
            articles: [eligibleArticle, staleArticle],
            pagesFetched: 1,
            reachedOverlap: true,
            maxPublishedDate: '2026-01-05 12:30:00'
        });

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).toHaveBeenCalledTimes(1);
        expect(mockFirestoreService.createNewsIfAbsent).toHaveBeenCalledWith(eligibleArticle);
    });

    it('execute_pipelineThrows_stillReleasesLease', async () => {
        // Arrange
        mockFirestoreService.getCursor.mockRejectedValue(new Error('cursor read failed'));

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow('cursor read failed');
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });
});
