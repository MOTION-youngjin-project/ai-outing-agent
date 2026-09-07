-- CreateTable
CREATE TABLE `regions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `parent_id` BIGINT UNSIGNED NULL,
    `region_code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `level` VARCHAR(20) NOT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `regions_region_code_key`(`region_code`),
    INDEX `regions_parent_id_name_idx`(`parent_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_categories` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `parent_id` BIGINT UNSIGNED NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `indoor_default` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `place_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `places` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `region_id` BIGINT UNSIGNED NULL,
    `name` VARCHAR(200) NOT NULL,
    `normalized_name` VARCHAR(200) NOT NULL,
    `category_summary` VARCHAR(300) NULL,
    `road_address` VARCHAR(500) NULL,
    `jibun_address` VARCHAR(500) NULL,
    `postal_code` VARCHAR(20) NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `website_url` VARCHAR(500) NULL,
    `short_description` VARCHAR(1000) NULL,
    `description` TEXT NULL,
    `business_status` VARCHAR(30) NOT NULL DEFAULT 'unknown',
    `price_level` SMALLINT NULL,
    `average_rating` DECIMAL(3, 2) NULL,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `reservation_available` BOOLEAN NULL,
    `parking_available` BOOLEAN NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_verified_at` TIMESTAMP(0) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `places_public_id_key`(`public_id`),
    INDEX `places_normalized_name_latitude_longitude_idx`(`normalized_name`, `latitude`, `longitude`),
    INDEX `places_region_id_is_active_idx`(`region_id`, `is_active`),
    INDEX `places_latitude_longitude_idx`(`latitude`, `longitude`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_source_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `external_place_key` VARCHAR(200) NOT NULL,
    `source_page_url` VARCHAR(1000) NULL,
    `source_rating` DECIMAL(3, 2) NULL,
    `source_review_count` INTEGER NULL,
    `raw_payload_json` JSON NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `source_updated_at` TIMESTAMP(0) NULL,
    `fetched_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NULL,

    INDEX `place_source_records_place_id_source_id_idx`(`place_id`, `source_id`),
    INDEX `place_source_records_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `place_source_records_source_id_external_place_key_key`(`source_id`, `external_place_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_images` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `source_id` BIGINT UNSIGNED NULL,
    `source_image_key` VARCHAR(250) NULL,
    `original_url` VARCHAR(1500) NOT NULL,
    `stored_url` VARCHAR(1500) NULL,
    `thumbnail_url` VARCHAR(1500) NULL,
    `alt_text` VARCHAR(500) NULL,
    `mime_type` VARCHAR(80) NULL,
    `width_px` INTEGER NULL,
    `height_px` INTEGER NULL,
    `sort_order` SMALLINT NOT NULL DEFAULT 0,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `license_info` VARCHAR(300) NULL,
    `captured_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `place_images_place_id_sort_order_idx`(`place_id`, `sort_order`),
    UNIQUE INDEX `place_images_source_id_source_image_key_key`(`source_id`, `source_image_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_business_hours` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `day_of_week` SMALLINT NOT NULL,
    `sequence_no` SMALLINT NOT NULL DEFAULT 1,
    `open_time` TIME(0) NULL,
    `close_time` TIME(0) NULL,
    `break_start_time` TIME(0) NULL,
    `break_end_time` TIME(0) NULL,
    `last_order_time` TIME(0) NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(300) NULL,
    `effective_from` DATE NULL,
    `effective_to` DATE NULL,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `place_business_hours_place_id_day_of_week_sequence_no_key`(`place_id`, `day_of_week`, `sequence_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_menus` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `price` INTEGER NULL,
    `image_url` VARCHAR(1500) NULL,
    `is_signature` BOOLEAN NOT NULL DEFAULT false,
    `is_available` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` SMALLINT NOT NULL DEFAULT 0,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `place_menus_place_id_sort_order_idx`(`place_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_facilities` (
    `place_id` BIGINT UNSIGNED NOT NULL,
    `facility_code` VARCHAR(60) NOT NULL,
    `available` BOOLEAN NOT NULL,
    `detail` VARCHAR(500) NULL,
    `verified_at` TIMESTAMP(0) NULL,

    PRIMARY KEY (`place_id`, `facility_code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_category_links` (
    `place_id` BIGINT UNSIGNED NOT NULL,
    `category_id` BIGINT UNSIGNED NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`place_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cultural_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `source_event_key` VARCHAR(150) NOT NULL,
    `venue_place_id` BIGINT UNSIGNED NULL,
    `title` VARCHAR(300) NOT NULL,
    `genre` VARCHAR(100) NULL,
    `start_at` TIMESTAMP(0) NULL,
    `end_at` TIMESTAMP(0) NULL,
    `fee_info` VARCHAR(300) NULL,
    `age_limit` VARCHAR(100) NULL,
    `booking_url` VARCHAR(500) NULL,
    `source_updated_at` TIMESTAMP(0) NULL,
    `synced_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cultural_events_start_at_end_at_idx`(`start_at`, `end_at`),
    UNIQUE INDEX `cultural_events_source_id_source_event_key_key`(`source_id`, `source_event_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_lots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `source_parking_key` VARCHAR(150) NOT NULL,
    `region_id` BIGINT UNSIGNED NULL,
    `name` VARCHAR(200) NOT NULL,
    `address` VARCHAR(500) NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `total_spaces` INTEGER NULL,
    `available_spaces` INTEGER NULL,
    `fee_info` VARCHAR(300) NULL,
    `operating_hours_json` JSON NULL,
    `congestion_status` VARCHAR(30) NULL,
    `realtime_supported` BOOLEAN NOT NULL DEFAULT false,
    `observed_at` TIMESTAMP(0) NULL,
    `synced_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `parking_lots_latitude_longitude_idx`(`latitude`, `longitude`),
    UNIQUE INDEX `parking_lots_source_id_source_parking_key_key`(`source_id`, `source_parking_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `air_quality_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `region_id` BIGINT UNSIGNED NOT NULL,
    `station_name` VARCHAR(120) NULL,
    `pm10_value` DECIMAL(8, 2) NULL,
    `pm10_grade` SMALLINT NULL,
    `pm25_value` DECIMAL(8, 2) NULL,
    `pm25_grade` SMALLINT NULL,
    `overall_grade` VARCHAR(30) NOT NULL,
    `measured_at` TIMESTAMP(0) NOT NULL,
    `fetched_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `freshness_status` ENUM('fresh', 'stale', 'unavailable') NOT NULL DEFAULT 'fresh',
    `raw_payload_hash` VARCHAR(64) NULL,

    INDEX `air_quality_snapshots_region_id_measured_at_idx`(`region_id`, `measured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weather_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `region_id` BIGINT UNSIGNED NOT NULL,
    `forecast_at` TIMESTAMP(0) NOT NULL,
    `temperature_c` DECIMAL(5, 2) NULL,
    `precipitation_probability` DECIMAL(5, 2) NULL,
    `precipitation_mm` DECIMAL(8, 2) NULL,
    `wind_speed_mps` DECIMAL(6, 2) NULL,
    `summary` VARCHAR(200) NULL,
    `fetched_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `freshness_status` ENUM('fresh', 'stale', 'unavailable') NOT NULL DEFAULT 'fresh',

    INDEX `weather_snapshots_region_id_forecast_at_idx`(`region_id`, `forecast_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rag_documents` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `external_key` VARCHAR(200) NULL,
    `title` VARCHAR(300) NOT NULL,
    `source_url` VARCHAR(1000) NULL,
    `document_type` VARCHAR(80) NULL,
    `published_at` TIMESTAMP(0) NULL,
    `source_updated_at` TIMESTAMP(0) NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `metadata_json` JSON NULL,
    `indexed_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `rag_documents_checksum_idx`(`checksum`),
    UNIQUE INDEX `rag_documents_source_id_external_key_key`(`source_id`, `external_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rag_chunks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT UNSIGNED NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `embedding` JSON NULL,
    `token_count` INTEGER NULL,
    `metadata_json` JSON NULL,

    UNIQUE INDEX `rag_chunks_document_id_chunk_index_key`(`document_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_runs` (
    `id` CHAR(36) NOT NULL,
    `session_key_hash` VARCHAR(64) NULL,
    `request_mode` ENUM('question', 'popular', 'retry') NOT NULL,
    `current_region_id` BIGINT UNSIGNED NULL,
    `environment_mode` ENUM('indoor', 'outdoor', 'mixed') NULL,
    `status` ENUM('pending', 'running', 'completed', 'partial', 'failed') NOT NULL DEFAULT 'pending',
    `route_count` SMALLINT NOT NULL DEFAULT 0,
    `data_updated_at` TIMESTAMP(0) NULL,
    `started_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` TIMESTAMP(0) NULL,
    `expires_at` TIMESTAMP(0) NOT NULL,
    `error_code` VARCHAR(80) NULL,
    `error_summary` VARCHAR(500) NULL,

    INDEX `agent_runs_session_key_hash_started_at_idx`(`session_key_hash`, `started_at`),
    INDEX `agent_runs_status_started_at_idx`(`status`, `started_at`),
    INDEX `agent_runs_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_ingestion_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `agent_run_id` CHAR(36) NULL,
    `source_id` BIGINT UNSIGNED NOT NULL,
    `external_place_key` VARCHAR(200) NOT NULL,
    `place_id` BIGINT UNSIGNED NULL,
    `ingestion_action` VARCHAR(30) NOT NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `received_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` TIMESTAMP(0) NULL,
    `error_summary` VARCHAR(500) NULL,

    INDEX `place_ingestion_events_agent_run_id_received_at_idx`(`agent_run_id`, `received_at`),
    INDEX `place_ingestion_events_source_id_external_place_key_received_idx`(`source_id`, `external_place_key`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tool_calls` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `agent_run_id` CHAR(36) NOT NULL,
    `source_id` BIGINT UNSIGNED NULL,
    `tool_name` VARCHAR(100) NOT NULL,
    `status` ENUM('requested', 'succeeded', 'failed', 'timed_out') NOT NULL,
    `attempt_no` SMALLINT NOT NULL DEFAULT 1,
    `request_params_hash` VARCHAR(64) NULL,
    `result_summary` JSON NULL,
    `started_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` TIMESTAMP(0) NULL,
    `latency_ms` INTEGER NULL,
    `error_code` VARCHAR(80) NULL,
    `error_summary` VARCHAR(500) NULL,

    INDEX `tool_calls_agent_run_id_started_at_idx`(`agent_run_id`, `started_at`),
    INDEX `tool_calls_tool_name_status_started_at_idx`(`tool_name`, `status`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rag_retrievals` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `tool_call_id` BIGINT UNSIGNED NOT NULL,
    `chunk_id` BIGINT UNSIGNED NOT NULL,
    `rank_no` SMALLINT NOT NULL,
    `similarity_score` DECIMAL(8, 6) NULL,
    `rerank_score` DECIMAL(8, 6) NULL,
    `used_in_answer` BOOLEAN NOT NULL DEFAULT false,

    INDEX `rag_retrievals_tool_call_id_rank_no_idx`(`tool_call_id`, `rank_no`),
    UNIQUE INDEX `rag_retrievals_tool_call_id_chunk_id_key`(`tool_call_id`, `chunk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recommendation_routes` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `agent_run_id` CHAR(36) NOT NULL,
    `rank_no` SMALLINT NOT NULL,
    `title` VARCHAR(250) NOT NULL,
    `recommendation_reason` TEXT NOT NULL,
    `environment_mode` ENUM('indoor', 'outdoor', 'mixed') NOT NULL,
    `current_air_quality_id` BIGINT UNSIGNED NULL,
    `destination_air_quality_id` BIGINT UNSIGNED NULL,
    `weather_snapshot_id` BIGINT UNSIGNED NULL,
    `estimated_duration_min` INTEGER NULL,
    `estimated_cost_min` INTEGER NULL,
    `estimated_cost_max` INTEGER NULL,
    `total_distance_m` INTEGER NULL,
    `safety_notice` TEXT NULL,
    `limitation_notice` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `recommendation_routes_agent_run_id_rank_no_key`(`agent_run_id`, `rank_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `route_places` (
    `route_id` BIGINT UNSIGNED NOT NULL,
    `sequence_no` SMALLINT NOT NULL,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `event_id` BIGINT UNSIGNED NULL,
    `stop_type` VARCHAR(50) NOT NULL,
    `expected_arrival_at` TIMESTAMP(0) NULL,
    `expected_stay_min` INTEGER NULL,
    `travel_distance_m` INTEGER NULL,
    `travel_duration_min` INTEGER NULL,
    `selection_reason` VARCHAR(1000) NULL,
    `verification_required` BOOLEAN NOT NULL DEFAULT false,

    INDEX `route_places_route_id_place_id_idx`(`route_id`, `place_id`),
    PRIMARY KEY (`route_id`, `sequence_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `route_parking_recommendations` (
    `route_id` BIGINT UNSIGNED NOT NULL,
    `anchor_place_id` BIGINT UNSIGNED NOT NULL,
    `parking_lot_id` BIGINT UNSIGNED NOT NULL,
    `rank_no` SMALLINT NOT NULL,
    `distance_m` INTEGER NOT NULL,
    `walking_minutes` INTEGER NULL,
    `selection_reason` VARCHAR(500) NULL,
    `realtime_status_available` BOOLEAN NOT NULL DEFAULT false,
    `selected` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`route_id`, `anchor_place_id`, `rank_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `popular_route_templates` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `region_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(250) NOT NULL,
    `description` TEXT NULL,
    `environment_mode` ENUM('indoor', 'outdoor', 'mixed') NOT NULL,
    `popularity_score` DECIMAL(10, 4) NOT NULL DEFAULT 0,
    `valid_from` TIMESTAMP(0) NULL,
    `valid_to` TIMESTAMP(0) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `popular_route_templates_region_id_is_active_popularity_score_idx`(`region_id`, `is_active`, `popularity_score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `popular_route_template_places` (
    `template_id` BIGINT UNSIGNED NOT NULL,
    `sequence_no` SMALLINT NOT NULL,
    `place_id` BIGINT UNSIGNED NOT NULL,
    `stop_type` VARCHAR(50) NOT NULL,
    `default_stay_min` INTEGER NULL,

    PRIMARY KEY (`template_id`, `sequence_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `place_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `places` ADD CONSTRAINT `places_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_source_records` ADD CONSTRAINT `place_source_records_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_source_records` ADD CONSTRAINT `place_source_records_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_images` ADD CONSTRAINT `place_images_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_images` ADD CONSTRAINT `place_images_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_business_hours` ADD CONSTRAINT `place_business_hours_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_menus` ADD CONSTRAINT `place_menus_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_facilities` ADD CONSTRAINT `place_facilities_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_category_links` ADD CONSTRAINT `place_category_links_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_category_links` ADD CONSTRAINT `place_category_links_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `place_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cultural_events` ADD CONSTRAINT `cultural_events_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cultural_events` ADD CONSTRAINT `cultural_events_venue_place_id_fkey` FOREIGN KEY (`venue_place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_lots` ADD CONSTRAINT `parking_lots_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_lots` ADD CONSTRAINT `parking_lots_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `air_quality_snapshots` ADD CONSTRAINT `air_quality_snapshots_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `air_quality_snapshots` ADD CONSTRAINT `air_quality_snapshots_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weather_snapshots` ADD CONSTRAINT `weather_snapshots_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weather_snapshots` ADD CONSTRAINT `weather_snapshots_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rag_documents` ADD CONSTRAINT `rag_documents_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rag_chunks` ADD CONSTRAINT `rag_chunks_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `rag_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_current_region_id_fkey` FOREIGN KEY (`current_region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_ingestion_events` ADD CONSTRAINT `place_ingestion_events_agent_run_id_fkey` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_ingestion_events` ADD CONSTRAINT `place_ingestion_events_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_ingestion_events` ADD CONSTRAINT `place_ingestion_events_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tool_calls` ADD CONSTRAINT `tool_calls_agent_run_id_fkey` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tool_calls` ADD CONSTRAINT `tool_calls_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rag_retrievals` ADD CONSTRAINT `rag_retrievals_tool_call_id_fkey` FOREIGN KEY (`tool_call_id`) REFERENCES `tool_calls`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rag_retrievals` ADD CONSTRAINT `rag_retrievals_chunk_id_fkey` FOREIGN KEY (`chunk_id`) REFERENCES `rag_chunks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_routes` ADD CONSTRAINT `recommendation_routes_agent_run_id_fkey` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_routes` ADD CONSTRAINT `recommendation_routes_current_air_quality_id_fkey` FOREIGN KEY (`current_air_quality_id`) REFERENCES `air_quality_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_routes` ADD CONSTRAINT `recommendation_routes_destination_air_quality_id_fkey` FOREIGN KEY (`destination_air_quality_id`) REFERENCES `air_quality_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_routes` ADD CONSTRAINT `recommendation_routes_weather_snapshot_id_fkey` FOREIGN KEY (`weather_snapshot_id`) REFERENCES `weather_snapshots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_places` ADD CONSTRAINT `route_places_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `recommendation_routes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_places` ADD CONSTRAINT `route_places_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_places` ADD CONSTRAINT `route_places_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `cultural_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_parking_recommendations` ADD CONSTRAINT `route_parking_recommendations_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `recommendation_routes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_parking_recommendations` ADD CONSTRAINT `route_parking_recommendations_anchor_place_id_fkey` FOREIGN KEY (`anchor_place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_parking_recommendations` ADD CONSTRAINT `route_parking_recommendations_parking_lot_id_fkey` FOREIGN KEY (`parking_lot_id`) REFERENCES `parking_lots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `popular_route_templates` ADD CONSTRAINT `popular_route_templates_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `popular_route_template_places` ADD CONSTRAINT `popular_route_template_places_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `popular_route_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `popular_route_template_places` ADD CONSTRAINT `popular_route_template_places_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
