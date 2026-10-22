-- One row per address a reader asked to receive the weekly edition at: an e-mail or a WhatsApp number (E.164).
-- It is sent nothing but its confirmation until the reader confirms it (`confirmed`); its token, in every
-- message, confirms it and takes it off the list. `consent` is the sentence the reader agreed to.
CREATE TABLE IF NOT EXISTS assinatura_subscribers (
  id bigserial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  address text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token text NOT NULL UNIQUE,
  consent text NOT NULL,
  consent_at timestamptz NOT NULL,
  confirm_sent_at timestamptz,
  confirm_attempts integer NOT NULL DEFAULT 0,
  confirm_error text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  left_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, address)
);
