/**
 * Константы для создания пользовательского шаблона
 */

import { TemplateCreationStep } from "../types";

// Конфигурация шагов
export const TEMPLATE_STEPS: Record<TemplateCreationStep, { title: string; description: string }> = {
    'file-upload': {
        title: 'Загрузка шаблона',
        description: 'Загрузите файл PPTX для начала',
    },
    'font-check': {
        title: 'Проверка шрифтов',
        description: 'Проверка шрифтов в презентации',
    },
    'font-upload': {
        title: 'Загрузка шрифтов',
        description: 'Загрузите отсутствующие шрифты для точного отображения',
    },
    'slides-preview': {
        title: 'Предпросмотр слайдов',
        description: 'Проверьте слайды перед обработкой',
    },
    'template-creation': {
        title: 'Создание шаблона',
        description: 'Преобразование слайдов в переиспользуемые шаблоны',
    },
    'completed': {
        title: 'Готово',
        description: 'Шаблон готов к сохранению',
    },
};

// UI Configuration
export const UI_CONFIG = {
    schemaEditorWidth: '520px',
    slideGridGap: '20px',
    maxContentWidth: '1400px',
}
// Преимущества
export const HIGHLIGHTS_ITEMS = [
    {
        number: "1",
        title: "Экономия времени",
        description: "Ручное форматирование и копирование слайдов отнимает часы каждую неделю",
    },
    {
        number: "2",
        title: "Снижение затрат",
        description: "Ресурсы дизайна тратятся на повторяющиеся задачи вместо инноваций",
    },
    {
        number: "3",
        title: "Единый стиль",
        description: "AI генерирует непредсказуемые макеты, требующие постоянной правки",
    },
]
