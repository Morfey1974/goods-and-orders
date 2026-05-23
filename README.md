# WEB Order Management — учёт заказов (עוסק פטור)

Первый релиз: **Этап A** — регистрация, вход, профиль бизнеса, i18n (RU/EN/HE), навигация, trial/subscription в коде.

Подробный план: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)  
Палитра цветов: [docs/color-palette.html](docs/color-palette.html)

---

## Требования

| Компонент | Версия |
|-----------|--------|
| Windows 10/11 | |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | для БД и API в контейнерах |
| [.NET 9 SDK](https://dotnet.microsoft.com/download) | локальный запуск API |
| [Node.js 20+](https://nodejs.org/) | фронтенд |

---

## Запуск без командной строки

На **рабочем столе**:

| Ярлык | Действие |
|-------|----------|
| **Zapusk - Uchet zakazov** | Запуск: Docker + API + веб + браузер |
| **Ostanovit - Uchet zakazov** | Остановка Docker |

Подпись под ярлыком — на латинице (так Windows не портит кириллицу). Имя ярлыка можно переименовать на русский вручную.

Если снова «кракозябры» — удалите старые ярлыки и запустите `scripts\Установить ярлыки на рабочий стол.bat`.

Перед запуском: откройте **Docker Desktop** и дождитесь **Engine running**.

Если ярлыков нет — один раз двойной щелчок по файлу:  
`scripts\Установить ярлыки на рабочий стол.bat`

---

## Быстрый старт (рекомендуется)

### 1. Запустить БД и API в Docker

```powershell
cd "c:\Users\morfe\Documents\Проект Интерлок\WEB order management"

# Опционально: скопировать секреты
copy .env.example .env

docker compose up -d --build
```

Дождитесь готовности (30–60 сек). API применит миграции БД автоматически при старте.

| Сервис | URL |
|--------|-----|
| API | http://localhost:8080 |
| Swagger | http://localhost:8080/swagger |
| Health | http://localhost:8080/api/health |
| PostgreSQL | `localhost:5432` (user/pass/db: `ordermgmt` / `ordermgmt_dev` / `ordermgmt`) |

### 2. Запустить фронтенд

В **новом** окне PowerShell:

```powershell
cd "c:\Users\morfe\Documents\Проект Интерлок\WEB order management\src\order-management-web"
npm install
npm run dev
```

| Сервис | URL |
|--------|-----|
| Веб-интерфейс | http://localhost:5173 |

Прокси `/api` → `http://localhost:8080` настроен в `vite.config.ts`.

### 3. Первый вход

1. Откройте http://localhost:5173  
2. **Регистрация** — email, пароль (мин. 8 символов), название бизнеса, ФИО  
3. Заполните **Настройки** (מספר עוסק, телефон, банк и т.д.)  
4. Переключите язык (עברית / Русский / English) — для иврита включается RTL

---

## Вариант 2 — API локально без Docker-образа API

### Только PostgreSQL в Docker

```powershell
cd "c:\Users\morfe\Documents\Проект Интерлок\WEB order management"
docker compose up -d db
```

### API из Visual Studio / CLI

```powershell
cd "c:\Users\morfe\Documents\Проект Интерлок\WEB order management\src\OrderManagement.Api"
dotnet run
```

По умолчанию API: http://localhost:5000 (см. `Properties/launchSettings.json`).

Для фронтенда укажите прокси:

```powershell
$env:VITE_API_PROXY="http://localhost:5000"
cd ..\order-management-web
npm run dev
```

Или в `vite.config.ts` временно смените `target` на `http://localhost:5000`.

### Миграции вручную (если не используете auto-migrate при старте)

```powershell
cd src\OrderManagement.Api
dotnet ef database update
```

---

## Остановка

```powershell
docker compose down
```

Удалить данные БД (осторожно):

```powershell
docker compose down -v
```

---

## Настройки

### Подписка / trial

В `src/OrderManagement.Api/appsettings.json`:

```json
"Subscription": {
  "EnforcementEnabled": false,
  "TrialDays": 30
}
```

| Переменная (Docker) | Значение |
|---------------------|----------|
| `SUBSCRIPTION_ENFORCEMENT` | `false` — отладка; `true` — блок после 30 дней |

При `EnforcementEnabled: true` после trial:
- **GET** — просмотр старых данных разрешён  
- **POST/PUT/DELETE** — ответ `402` с кодом `SUBSCRIPTION_EXPIRED`

### JWT

Смените `Jwt:Secret` в production (минимум 32 символа). В Docker: `JWT_SECRET` в `.env`.

---

## Структура проекта

```
├── docker-compose.yml
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── color-palette.html
├── src/
│   ├── OrderManagement.Api/     # .NET 9 Web API
│   └── order-management-web/    # React + Vite + i18n
└── README.md
```

---

## API (Этап A)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Проверка |
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| GET | `/api/tenant/profile` | Профиль (JWT) |
| PUT | `/api/tenant/profile` | Обновление (JWT, version) |

---

## Устранение неполадок

| Проблема | Решение |
|----------|---------|
| Docker не запускается | Запустите Docker Desktop |
| `connection refused` на API | `docker compose ps` — контейнер `api` должен быть Up |
| Порт 5432 занят | Остановите другой PostgreSQL или смените порт в `docker-compose.yml` |
| CORS | В `appsettings.json` добавьте origin фронтенда в `Cors:Origins` |
| Иврит «ломает» layout | Выберите עברית — `dir=rtl` применяется автоматически |

---

## Следующий этап (B)

Справочники: клиенты, артикулы FG/CP/SV, BOM, склад.
