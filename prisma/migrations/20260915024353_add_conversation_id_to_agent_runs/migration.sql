-- AlterTable
ALTER TABLE `agent_runs` ADD COLUMN `conversation_id` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `agent_runs_conversation_id_idx` ON `agent_runs`(`conversation_id`);
