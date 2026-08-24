# dota-duo-data

Автоматический сбор свежих совместных ranked-матчей Dota 2 для двух аккаунтов:

- Cyborg: `206620580`
- Goddess: `160810596`

Источник данных: OpenDota API.

GitHub Actions запускается ежедневно перед 09:00 по Красноярску и обновляет `data/latest.json`.

`position_guess` — эвристика, а не гарантированная позиция Valve. Mid определяется по lane_role, а safe/offlane core/support разделяются по фарму и экономике. Всегда учитывайте `position_confidence`.
