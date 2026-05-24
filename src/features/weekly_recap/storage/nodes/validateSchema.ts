import { Logger } from '../../../../core/logger';
import { isValidLLMPartial } from '../helpers/llm';
import type { WeeklyRecapState } from '../usecase';
export { isValidLLMPartial };

const logger = new Logger('WeeklyRecap/Storage/Node/ValidateSchema');

export function makeValidateSchemaNode() {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { llmPartial, ticker } = state;
    let valid = true;

    const assertField = (field: string, value: unknown, check: boolean): void => {
      if (!check) {
        valid = false;
        logger.error(`Schema validation failed for ${ticker}: field "${field}" is invalid`, {
          field,
          value: JSON.stringify(value),
        });
      }
    };

    assertField('messageTitle',        llmPartial?.messageTitle,        typeof llmPartial?.messageTitle === 'string' && llmPartial.messageTitle.length > 0);
    assertField('messageShortSummary', llmPartial?.messageShortSummary, typeof llmPartial?.messageShortSummary === 'string' && llmPartial.messageShortSummary.length > 0);
    assertField('messageLongSummary',  llmPartial?.messageLongSummary,  typeof llmPartial?.messageLongSummary === 'string' && llmPartial.messageLongSummary.length > 0);
    assertField(
      'confidenceScore',
      llmPartial?.confidenceScore,
      typeof llmPartial?.confidenceScore === 'number' &&
        Number.isInteger(llmPartial.confidenceScore) &&
        llmPartial.confidenceScore >= 0 &&
        llmPartial.confidenceScore <= 100,
    );
    assertField('newsLinks',   llmPartial?.newsLinks,   Array.isArray(llmPartial?.newsLinks));
    assertField('eightKLinks', llmPartial?.eightKLinks, Array.isArray(llmPartial?.eightKLinks));

    if (!valid) return {};  // routeAfterValidation routes to END

    logger.info(`Schema valid for ${ticker}`);
    return {};
  };
}
