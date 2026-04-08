ALTER TABLE public.check_configs
ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.check_configs.sort_order IS '自定义排序值，数值越小越靠前';

UPDATE public.check_configs AS config
SET sort_order = ordered.row_num
FROM (
    SELECT
        id,
        row_number() OVER (
            ORDER BY
                COALESCE(sort_order, 2147483647),
                name ASC,
                created_at ASC,
                id ASC
        ) AS row_num
    FROM public.check_configs
) AS ordered
WHERE config.id = ordered.id
  AND config.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_check_configs_sort_order
ON public.check_configs (sort_order, name);
