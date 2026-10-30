-- The group whose link brought the sign-up (/assine?g=<tag>, modules/assinatura/group.ts): the first one is kept.
ALTER TABLE assinatura_subscribers ADD COLUMN IF NOT EXISTS group_tag text;
