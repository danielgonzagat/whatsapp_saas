DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailDeliveryEvent') THEN
    CREATE TYPE "EmailDeliveryEvent" AS ENUM (
      'SENT',
      'FAILED',
      'DELIVERED',
      'OPENED',
      'CLICKED',
      'REPLIED',
      'BOUNCED',
      'COMPLAINT',
      'UNSUBSCRIBED'
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = '"EmailDeliveryEvent"'::regtype
      AND enumlabel = 'FAILED'
  ) THEN
    ALTER TYPE "EmailDeliveryEvent" ADD VALUE 'FAILED';
  END IF;
END $$;
