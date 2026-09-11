ALTER TABLE `agent_runs` ADD COLUMN `recommendation_json` JSON NULL;
CREATE TABLE `tour_api_query_caches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cache_key` CHAR(64) NOT NULL,
  `keyword` VARCHAR(200) NOT NULL,
  `result_limit` SMALLINT NOT NULL,
  `payload_json` JSON NOT NULL,
  `fetched_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `expires_at` TIMESTAMP(0) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `tour_api_query_caches_cache_key_key` (`cache_key`), INDEX `tour_api_query_caches_expires_at_idx` (`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
