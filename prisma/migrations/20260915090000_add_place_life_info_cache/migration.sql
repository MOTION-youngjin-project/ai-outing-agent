CREATE TABLE `place_life_info_caches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `place_id` BIGINT UNSIGNED NOT NULL,
  `topic` VARCHAR(40) NOT NULL,
  `payload_json` JSON NOT NULL,
  `source_count` SMALLINT NOT NULL DEFAULT 0,
  `ai_used` BOOLEAN NOT NULL DEFAULT FALSE,
  `fetched_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `expires_at` TIMESTAMP(0) NOT NULL,
  UNIQUE INDEX `place_life_info_caches_place_id_topic_key` (`place_id`, `topic`),
  INDEX `place_life_info_caches_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `place_life_info_caches_place_id_fkey`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
