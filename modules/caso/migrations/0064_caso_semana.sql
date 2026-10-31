-- The case of the week: a short clinical case the editor writes for one weekly edition (`week`, the ISO week
-- the edition covers), with an optional picture (`image`, a file under the data folder's uploads/caso,
-- re-encoded without its metadata), a question with optional choices (`correct` indexes `options`), and the
-- answer that the next edition shows. Only a published case shows; one case per edition.
CREATE TABLE IF NOT EXISTS caso_semana (
  id serial PRIMARY KEY,
  week text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  image text,
  image_width integer,
  image_height integer,
  image_caption text,
  question text NOT NULL,
  options text[] NOT NULL DEFAULT '{}',
  correct integer,
  answer text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado')),
  created_by text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
