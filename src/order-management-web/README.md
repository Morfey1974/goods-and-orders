# order-management-web

Фронтенд учёта заказов: React 19 + Vite + TypeScript + i18n (עברית / Русский / English).

**Документация проекта, Docker, API и запуск:** [корневой README](../../README.md)

## Локальная разработка

```powershell
npm install
npm run dev
```

http://localhost:5173 — прокси `/api` → `http://localhost:8080` (см. `vite.config.ts`).

## Сборка

```powershell
npm run build
```

## Основные модули UI

| Путь | Назначение |
|------|------------|
| `src/pages/DocumentsPage.tsx` | Список документов, PDF-превью |
| `src/components/documents/ReceiptEditWizard.tsx` | Редактор קבלה (строки оплаты) |
| `src/components/documents/DocumentCreateWizard.tsx` | הצעת מחיר / חשבון חיוב |
| `src/components/ui/AppModal.tsx` | Модальные окна с ресайзом |
| `src/lib/resizablePanelKeys.ts` | Ключи `localStorage` для размеров окон |
