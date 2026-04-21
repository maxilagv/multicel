-- V11: hardening de la cola de mensajes salientes
-- Agrega: attempts, max_attempts, locked_at, next_attempt_at, error_code,
--         provider, provider_message_id sobre whatsapp_campaign_recipients.
-- Idempotente: cada ALTER solo se ejecuta si la columna no existe.

SET @a1 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='attempts'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER estado'));
PREPARE s1 FROM @a1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @a2 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='max_attempts'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN max_attempts INT UNSIGNED NOT NULL DEFAULT 5 AFTER attempts'));
PREPARE s2 FROM @a2; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @a3 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='locked_at'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN locked_at DATETIME NULL AFTER max_attempts'));
PREPARE s3 FROM @a3; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @a4 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='next_attempt_at'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN next_attempt_at DATETIME NULL AFTER locked_at'));
PREPARE s4 FROM @a4; EXECUTE s4; DEALLOCATE PREPARE s4;

SET @a5 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='error_code'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN error_code VARCHAR(40) NULL AFTER error_message'));
PREPARE s5 FROM @a5; EXECUTE s5; DEALLOCATE PREPARE s5;

SET @a6 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='provider'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN provider VARCHAR(20) NULL AFTER error_code'));
PREPARE s6 FROM @a6; EXECUTE s6; DEALLOCATE PREPARE s6;

SET @a7 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND column_name='provider_message_id'),'SELECT 1','ALTER TABLE whatsapp_campaign_recipients ADD COLUMN provider_message_id VARCHAR(160) NULL AFTER provider'));
PREPARE s7 FROM @a7; EXECUTE s7; DEALLOCATE PREPARE s7;

-- Indice compuesto para que el worker sea eficiente al hacer polling
SET @ix1 = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='whatsapp_campaign_recipients' AND index_name='ix_wcr_queue_poll'),'SELECT 1','CREATE INDEX ix_wcr_queue_poll ON whatsapp_campaign_recipients(estado, next_attempt_at, locked_at)'));
PREPARE si1 FROM @ix1; EXECUTE si1; DEALLOCATE PREPARE si1;

-- Recuperar filas huerfanas: si quedaron en sending mas de 10 minutos
-- (puede ocurrir si el proceso murio durante un envio previo)
UPDATE whatsapp_campaign_recipients
   SET estado = 'pending',
       locked_at = NULL,
       next_attempt_at = CURRENT_TIMESTAMP
 WHERE estado = 'sending'
   AND locked_at IS NOT NULL
   AND locked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE);