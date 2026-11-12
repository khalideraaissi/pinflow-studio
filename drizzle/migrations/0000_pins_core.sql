CREATE TABLE public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buffer_api_key text,
  organization_id text,
  channel_id text,
  default_board_id text,
  image_model text NOT NULL DEFAULT 'openai/gpt-image-2.5-sunburst',
  image_format text NOT NULL DEFAULT 'png',
  append_hashtags boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (1);

CREATE TABLE public.pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name text,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  image_prompt text NOT NULL DEFAULT '',
  article_url text NOT NULL DEFAULT '',
  board_id text,
  image_url text,
  image_path text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  buffer_post_id text,
  buffer_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pins TO service_role;
ALTER TABLE public.pins ENABLE ROW LEVEL SECURITY;