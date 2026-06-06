# WEB Order Management — учёт заказов (עוסק פטור)

Веб-приложение для малого бизнеса в Израиле: клиенты, поставщики, закупки (приходные накладные), каталог с группами товаров, склад, заказы, документы (הצעת מחיר / חשבון חיוב / קבלה), складские отчёты PDF, профиль עוסק פטור.

Подробный план: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)  
Склад FIFO / себестоимость: [docs/INVENTORY_COSTING_PLAN.md](docs/INVENTORY_COSTING_PLAN.md)  
Палитра цветов: [docs/color-palette.html](docs/color-palette.html)

**Удалённый репозиторий:** https://github.com/Morfey1974/goods-and-orders

---

## Требования

| Компонент | Версия |
|-----------|--------|
| Windows 10/11 | |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | PostgreSQL + API в контейнерах |
| [.NET 9 SDK](https://dotnet.microsoft.com/download) | локальный запуск API (опционально) |
| [Node.js 20+](https://nodejs.org/) | фронтенд |

---

## Быстрый старт

### 1. Клонировать и запустить API + БД (Docker)

```powershell
git clone https://github.com/Morfey1974/goods-and-orders.git
cd goods-and-orders

copy .env.example .env   # опционально: JWT_SECRET

docker compose up -d --build
```

Дождитесь готовности (30–60 с). **Миграции БД применяются автоматически** при старте API.

| Сервис | URL |
|--------|-----|
| API | http://localhost:8080 |
| Swagger | http://localhost:8080/swagger |
| Health | http://localhost:8080/api/health |
| PostgreSQL | `localhost:5432` — `ordermgmt` / `ordermgmt_dev` / `ordermgmt` |

### 2. Фронтенд

В **новом** окне PowerShell:

```powershell
cd src\order-management-web
npm install
npm run dev
```

| Сервис | URL |
|--------|-----|
| Веб-интерфейс | http://localhost:5173 |

Прокси `/api` → `http://localhost:8080` задан в `vite.config.ts`.

### 3. Первый вход

1. http://localhost:5173 → **Регистрация**  
2. **Настройки** — профиль, контакты, банк, логотип, подпись, PDF для клиентов  
3. Язык: עברית / Русский / English (RTL для иврита)

**Сброс пароля:** на странице входа — «Забыли пароль?» → письмо со ссылкой (при `Email:Enabled: false` ссылка пишется в лог API). В `appsettings.json` задайте `App:FrontendBaseUrl` (URL фронтенда для ссылки сброса).

---

## После обновления кода (`git pull`)

Обязательно **пересоберите контейнер API** (новые миграции и эндпоинты):

```powershell
docker compose up -d --build api
```

Новые миграции БД (применяются при старте API):

- `ReceiptPaymentLines` — строки оплаты в קבלה
- `Tenant.WithholdingTaxPercent` — % ניכוי במקור по умолчанию
- `CustomerContacts` — контакты клиента для email
- `PasswordResetTokens` — одноразовые токены сброса пароля
- `Suppliers`, `SupplierContacts`, `PurchaseReceipts`, `PurchaseReceiptLines` — поставщики и приходные накладные
- `AddProductTrackInventory` — флаг учёта остатков по товару
- `SyncProductGroupsModel` — группы товаров (`ProductGroups`, `ProductGroupMembers`)
- `AddInventoryCosting` — партии FIFO, средняя WAC, метод оценки в настройках
- `AddProductWarehouseId` — склад по умолчанию в карточке товара
- `DocumentNumberByTypeAndPlainNumbers` — номера документов **без префикса** (377, 40051, 80036)
- `SetTrackInventoryDefaultFalse` — по умолчанию «Учитывать на складе» = **Нет** (для поэтапной корректировки остатков)

Фронтенд при изменениях UI:

```powershell
cd src\order-management-web
npm install
npm run dev
```

---

## Запуск с рабочего стола (Windows)

| Ярлык | Действие |
|-------|----------|
| **Zapusk - Uchet zakazov** | Docker + API + веб + браузер |
| **Ostanovit - Uchet zakazov** | Остановка |

Перед запуском: **Docker Desktop** → Engine running.  
Ярлыки: `scripts\Установить ярлыки на рабочий стол.bat`

---

## Настройки бизнеса (вкладка «Настройки»)

| Раздел | Содержание |
|--------|------------|
| Общие данные | Название, ת.ז., עוסק, категория, адрес, **% ניכוי במקור**, **метод оценки склада** (FIFO / WAC) |
| Контакты | Email (редактируемый), телефоны, сайт, язык |
| Логотип и подпись | JPG/PNG/WebP → PDF הצעת מחיר и другие документы; **просмотр образца** документа с брендингом |
| Документы для клиентов | PDF: אישור חשבון, כרטיס חברה, ניהול ספרים, ניכוי מס — загрузка и **отправка по email** |
| **Нумерация документов** | Следующий номер для הצעה / заказа / חשבון / קבלה — **без префикса**, как в YeshInvoice |
| Банковские реквизиты | Код банка (справочник IL), филиал, счёт, SWIFT/ABA/IBAN |

Файлы хранятся в Docker-volume `ordermgmt_uploads` (путь в контейнере: `/app/uploads`).

---

## Клиенты

| Возможность | Описание |
|-------------|----------|
| Карточка клиента | Полные поля, логотип, **несколько אנשי קשר** (имя, телефон, email) для отправки документов |
| Импорт CSV | Кнопка на странице «לקוחות» — экспорт из Yesh (`yesh_export_customers_*.csv`), опция обновления существующих по имени |
| Дедупликация | Совпадение по нормализованному имени (без поля «מפתח זר») |

---

## Поставщики и закупки

| Возможность | Описание |
|-------------|----------|
| **Поставщики** | Справочник с международными полями (страна ISO, VAT, валюта, банк, адрес), карточка поставщика |
| **Приходные накладные** | Поставщик, дата, № инвойса, строки товаров, вложение PDF/изображение (инвойс) |
| **Сохранение** | Кнопка **«Сохранить документ»** сохраняет накладную и **сразу оприходует** товары на склады (движения `Receipt`); возврат в список «Закупки» |
| **Обязательные поля** | Поставщик; в каждой строке — **склад** (для товаров со складским учётом) и **цена закупки** > 0 |
| **Выбор товаров** | Модальное окно по образцу מחירון: отметка строк, **Сохранить** добавляет позиции в накладную |
| **Несохранённые изменения** | При уходе со страницы без сохранения — диалог (сохранить / не сохранять / отмена); при успешном сохранении диалог не показывается |

Склад в строке: для товаров с учётом остатков нужно выбрать конкретный склад (не «По типу товара»). Услуги без складского учёта — склад не требуется.

Эндпоинты:

- `GET/POST/PUT/DELETE /api/suppliers`, `GET /api/suppliers/{id}`
- `GET/POST /api/purchase-receipts`, `GET/PUT/DELETE /api/purchase-receipts/{id}`
- `POST /api/purchase-receipts/{id}/post` — оприходование (вызывается из UI при сохранении)
- `POST/DELETE /api/purchase-receipts/{id}/document` — вложение PDF/изображение

Миграции: `AddSuppliersAndPurchaseReceipts`, `AddProductTrackInventory`.

---

## Каталог товаров

| Возможность | Описание |
|-------------|----------|
| **Группы товаров** | Справочник групп на странице «Товары и услуги»; фильтр и привязка товаров к группам (мультивыбор в карточке) |
| **Тип / вид** | Колонки типа и вида товара; учёт остатков по флагу `trackInventory` (по умолчанию **выключен**) |
| **Карточка товара** | Редактирование цены, групп, склада, BOM; **«Сохранить»** не закрывает окно; **«Закрыть»** — с предупреждением о несохранённых изменениях |
| **Таблица каталога** | Клик по **артикулу** → карточка; **ширина колонок** перетаскиванием (сохраняется в браузере); содержимое по центру, кроме «Название» |

Эндпоинты: `GET/POST/PUT/DELETE /api/product-groups`, `PUT /api/product-groups/{id}/members`.

Миграции: `SyncProductGroupsModel`, `AddProductWarehouseId`, `SetTrackInventoryDefaultFalse`.

---

## Склад и отчёты

| Возможность | Описание |
|-------------|----------|
| Склад | Остатки по складам (компоненты, готовая продукция, пользовательские); приход, движения |
| **Себестоимость** | FIFO (партии) или WAC (средняя) — в настройках; оприходование из закупок с ценой строки |
| **Начальный остаток** | Отчёты → ввод партий и цен (для переноса из старой программы) |
| **Оценка склада** | Отчёт по стоимости остатков по выбранному методу |
| Движения | Модальное окно истории движений по товару; отчёт PDF |
| **Отчёты** (вкладка «Отчёты») | PDF с шапкой бизнеса на иврите; интерфейс выбора — на языке UI |
| Остатки по складам | Группировка по складу; опция «Показывать нулевые остатки» |
| Движения товаров | Фильтр по складу и периоду; **быстрый период** (выпадающий список: сегодня, неделя, месяц, 2 месяца, текущий/прошлый год); просмотр и скачивание PDF |

Количества в складских отчётах и новых движениях — **целые числа** (без дробной части).

Эндпоинты PDF:

- `GET /api/warehouse/reports/balances/pdf?warehouseId=&includeZero=`
- `GET /api/warehouse/reports/movements/pdf?warehouseId=&from=&to=&limit=`

Параметры `from` / `to` — даты в формате `YYYY-MM-DD` (границы дня в UTC).

---

## Документы

| Тип | PDF / UI |
|-----|----------|
| הצעת מחיר (Quote) | PDF с баннером «לפרויקט …»; таблица позиций товара |
| חשבון חיוב (Charge) | Тот же макет; баннер: «על בסיס הצעת מחיר מס׳ …» |
| קבלה (Receipt) | Баннер: «על בסיס חשבון חיוב מס׳ …»; **таблица строк оплаты** (תאריך, סוג תשלום, פירוט, סה״כ), не позиции счёта |

**Нумерация:** номера **без префикса** (377, 40051, 80036) — как в YeshInvoice; счётчики в **Настройки → Нумерация документов**.

**Импорт из YeshInvoice:** кнопка **«Импорт CSV»** на странице «Документы» — экспорт הצעה / חשבון / קבלה; клиент по עוסק/שם; связи quote↔charge↔receipt по тексту в описании; склад при импорте **не списывается**.

**Удаление:** каскадное — при удалении הצעה удаляются связанные חשבון и קבלה (с подтверждением).

### קבלה — редактор оплаты

- Вкладки: ניכוי במקור, העברה בנקאית, צ׳ק, כרטיס אשראי, אפליקציה, PayPal, מזומן, אחר.
- Каждая строка — **«Сохранить строку»**, затем **«Сохранить черновик»** (можно открыть PDF без выпуска) или **«Выпустить קבלה»**.
- % ניכוי במקור подставляется из настроек бизнеса; сумма банковского перевода пересчитывается автоматически.
- **«Просмотр PDF»** / **«Отправить по email»** в подвале мастера (email — заглушка до SMTP).

### Список документов

- Отдельные колонки **№** и **Статус** (бейджи одной ширины, подписи на языке интерфейса: ru / en / he).
- Клик по номеру — превью PDF. Меню выпуска: חשבון חיוב / קבלה из הצעה.

Для баннера חשבון חיוב укажите **הצעת מחיר** как родительский документ (`parentDocumentId` при создании).

Мастера הצעה / חשבון חיוב / קבלה — полноэкранные, с **запоминанием размера** окна (`localStorage`). Общий **`AppModal`** для диалогов (ресайз, Escape, без ложного закрытия при перетаскивании угла).

---

## Фронтенд: модальные окна (`AppModal`)

Новые диалоги оборачиваются в `src/order-management-web/src/components/ui/AppModal.tsx`:

```tsx
<AppModal open={open} onClose={() => setOpen(false)} size="md">
  …содержимое…
</AppModal>
```

Для крупных окон с запоминанием размера — проп `resize` с уникальным `storageKey` (см. PDF-превью, карточка товара, банк в настройках).

---

## Email (SMTP) — пока заглушка

В `src/OrderManagement.Api/appsettings.json`:

```json
"Email": {
  "Enabled": false
},
"App": {
  "FrontendBaseUrl": "http://localhost:5173"
}
```

При `Enabled: false` кнопка «Отправить файлы по email» **не шлёт письмо**, а показывает сообщение о режиме заглушки (запрос логируется на сервере). То же для **сброса пароля** — ссылка `/reset-password?token=…` выводится в лог API.  
Когда будут данные SMTP — установите `Enabled: true` и заполните `SmtpHost`, `SmtpPort`, `SmtpUser`, `SmtpPassword`, `FromAddress` (реализация отправки в `TenantEmailService` и `PasswordResetMailer`).

---

## Подписка / trial

```json
"Subscription": {
  "EnforcementEnabled": false,
  "TrialDays": 30
}
```

Docker: `SUBSCRIPTION_ENFORCEMENT=false` в `.env`.

---

## Остановка Docker

```powershell
docker compose down
```

Удалить **все** данные (БД + загруженные файлы):

```powershell
docker compose down -v
```

---

## Структура проекта

```
├── docker-compose.yml
├── docs/
├── scripts/                    # ярлыки запуска
├── tools/
│   └── HashPassword/           # утилита хеширования пароля (dev)
├── src/
│   ├── OrderManagement.Api/    # .NET 9 Web API, QuestPDF, импорт клиентов, складские отчёты
│   └── order-management-web/   # React + Vite + i18n (ru/en/he), AppModal, отчёты
└── README.md
```

---

## API (основное)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register`, `/login` | Регистрация / вход |
| POST | `/api/auth/forgot-password`, `/reset-password` | Запрос ссылки сброса / установка нового пароля |
| GET/PUT | `/api/tenant/profile` | Профиль |
| PUT | `/api/tenant/bank-details` | Банк |
| GET | `/api/tenant/assets` | Сводка: лого, подпись, PDF |
| POST/DELETE | `/api/tenant/assets/logo`, `/signature` | Брендинг |
| POST/DELETE | `/api/tenant/assets/compliance/{kind}` | PDF (`AccountOwnership`, `BusinessCard`, `BooksManagement`, `WithholdingTax`) |
| POST | `/api/tenant/assets/compliance/send-email` | Отправка PDF (SMTP stub) |
| POST | `/api/customers/import` | Импорт клиентов из CSV (`updateExisting` в query) |
| … | `/api/customers`, `/products`, `/orders`, `/documents` | Справочники и документы |
| GET/POST/PUT/DELETE | `/api/suppliers` | Поставщики |
| GET/POST/PUT/DELETE | `/api/purchase-receipts` | Приходные накладные |
| POST | `/api/purchase-receipts/{id}/post` | Оприходование на склад |
| POST/DELETE | `/api/purchase-receipts/{id}/document` | Вложение к накладной |
| GET/POST/PUT/DELETE | `/api/product-groups` | Группы товаров |
| PUT | `/api/product-groups/{id}/members` | Состав группы |
| GET/PUT | `/api/document-sequences` | Счётчики номеров документов (без префикса) |
| POST | `/api/documents/import` | Импорт CSV документов из YeshInvoice |
| GET/POST | `/api/inventory/opening-balance`, `/valuation` | Начальный остаток и оценка склада |
| PUT | `/api/documents/{id}/receipt` | Сохранение קבלה (`paymentLines`, `finalize: true/false`) |
| GET | `/api/documents/{id}/pdf` | PDF: Quote, ChargeInvoice, Receipt (קבלה — строки оплаты) |
| POST | `/api/documents/{id}/send-email` | Отправка документа (заглушка) |
| GET | `/api/warehouse/balances`, `/movements` | Остатки и движения (фильтры `warehouseId`, `from`, `to`) |
| GET | `/api/warehouse/reports/balances/pdf` | PDF отчёт по остаткам |
| GET | `/api/warehouse/reports/movements/pdf` | PDF отчёт по движениям |

Полный список — Swagger: http://localhost:8080/swagger

Пример CSV для товаров: [docs/import-products-example.csv](docs/import-products-example.csv)

---

## Устранение неполадок

| Проблема | Решение |
|----------|---------|
| Ошибка при загрузке PDF / 404 на `/api/tenant/assets` | `docker compose up -d --build api` |
| `Only PDF files are allowed` при корректном PDF | Обновите API (см. выше); допускается `application/octet-stream` |
| Docker не стартует | Запустите Docker Desktop |
| API недоступен | `docker compose ps` — сервис `api` Up |
| CORS | Добавьте origin в `Cors:Origins` в `appsettings.json` |
| Порт 5432 занят | Смените порт в `docker-compose.yml` или остановите другой PostgreSQL |
| PDF הצעה не открывается / 500 | Пересоберите API; в контейнере должны быть шрифты `Assets/Fonts/NotoSansHebrew-*.ttf` |
| Отчёт по движениям — Internal Server Error при выборе дат | Пересоберите API (`docker compose up -d --build api`); нужна нормализация дат UTC |
| Модальное окно закрывается при ресайзе | Обновите фронтенд — используется `AppModal`, не сырой `onClick` на overlay |
| Ошибка concurrency при сохранении накладной | `docker compose up -d --build api`; обновите страницу и сохраните снова |
| Кнопка «Сохранить документ» неактивна | Заполните поставщика, склад и цену закупки во всех строках |

---

## Лицензия / разработка

Частный проект. Вопросы и доработки — через issues в GitHub-репозитории.
