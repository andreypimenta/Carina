-- Whether the edition's e-mail carried the case of the week's answer links: its readers were asked.
ALTER TABLE assinatura_editions ADD COLUMN IF NOT EXISTS caso boolean NOT NULL DEFAULT false
