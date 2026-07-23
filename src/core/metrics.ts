import { Logger } from './logger';

const _logger = new Logger('Metrics');

const METRIC_LOG_PREFIX = 'metric:';

export type MetricLabels = Record<string, string | number | boolean>;

export function emitMetric(name: string, labels: MetricLabels = {}, value = 1): void {
    _logger.info(`${METRIC_LOG_PREFIX}${name}`, { ...labels, metric: name, value });
}
