-- Clicks on the site's share buttons ("Mandar no WhatsApp", "Copiar link", "Indique a um colega") by day:
-- button clicks, not confirmed forwards. Counts only.
CREATE TABLE IF NOT EXISTS assinatura_buttons (
  day date NOT NULL,
  button text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, button)
)
