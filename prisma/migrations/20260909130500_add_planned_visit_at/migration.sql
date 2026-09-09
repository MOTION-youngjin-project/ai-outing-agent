-- 저장한 장소에 방문 예정일 추가. NULL이면 그냥 저장한 장소, 값이 있으면 방문 예정.
ALTER TABLE `saved_places` ADD COLUMN `planned_visit_at` DATE NULL;
