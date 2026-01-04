// Mock src/core/firebase
const getTemplateMock = jest.fn();
jest.mock('../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn(() => ({
        remoteConfig: jest.fn(() => ({
            getTemplate: getTemplateMock
        }))
    }))
}));

import { getRemoteConfig as getRemoteConfigType } from '../../core/remote-config';

describe('Remote Config Utility', () => {
    // Access getTemplateMock directly since it is in the module scope
    const mockGetTemplate = getTemplateMock;
    let getRemoteConfig: typeof getRemoteConfigType;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        // Re-require the module to reset the internal cache variable
        // We need to re-mock firebase because resetModules clears the mock registry for that module if not careful,
        // but here we defined the mock factory at top level which usually persists, 
        // however 'jest.mock' calls are hoisted.
        // Let's re-require the module under test.
        const module = await import('../../core/remote-config');
        getRemoteConfig = module.getRemoteConfig;
    });

    it('should return parsed config from valid template', async () => {
        // Arrange
        mockGetTemplate.mockResolvedValue({
            parameters: {
                daily_brands_sectors: { defaultValue: { value: '["Tech", "Energy"]' } },
                'gemini_model_name': { defaultValue: { value: 'gemini-test-model' } }
            }
        });

        // Act
        const config = await getRemoteConfig();

        // Assert
        expect(config.sectors).toEqual(['Tech', 'Energy']);
        expect(config.gemini_model_name).toBe('gemini-test-model');
        // FMP defaults when param is missing
        expect(config.fmp.baseUrl).toBe('https://financialmodelingprep.com/stable');
    });

    it('should parse FMP config from remote param', async () => {
        // Arrange
        mockGetTemplate.mockResolvedValue({
            parameters: {
                fmp_config: { defaultValue: { value: '{"baseUrl": "https://custom.url", "v3Url": "https://custom.v3", "v4Url": "https://custom.v4"}' } }
            }
        });

        // Act
        const config = await getRemoteConfig();

        // Assert
        expect(config.fmp.baseUrl).toBe('https://custom.url');
        expect(config.fmp.v4Url).toBe('https://custom.v4');
    });

    it('should fallback to defaults on error', async () => {
        // Arrange
        mockGetTemplate.mockRejectedValue(new Error('Fetch failed'));

        // Act
        const config = await getRemoteConfig();

        // Assert
        expect(config).toBeDefined();
        expect(Array.isArray(config.sectors)).toBe(true);
        expect(config.fmp.baseUrl).toBe('https://financialmodelingprep.com/stable');
    });
});

