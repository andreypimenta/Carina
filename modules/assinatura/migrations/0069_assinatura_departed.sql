-- A confirmed reader whose address the retention run erased: the channel, the group whose link brought them and
-- the days they confirmed and left, without the address, so retention by origin still counts them.
CREATE TABLE IF NOT EXISTS assinatura_departed (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  group_tag text,
  confirmed_on date NOT NULL,
  left_on date NOT NULL
)
