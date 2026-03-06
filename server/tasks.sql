-- Set this before you start tasks (you will need to login to mysql using root and not the user)
SET GLOBAL event_scheduler = ON;

USE anchor_db;
CREATE EVENT IF NOT EXISTS delete_expired_anchors
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM anchors WHERE status = 'EXPIRED';
