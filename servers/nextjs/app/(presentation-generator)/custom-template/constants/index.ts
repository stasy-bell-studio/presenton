/**
 * Constants for Custom Template Creation Flow
 */

import { TemplateCreationStep } from "../types";

// Step configuration
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
// Highlights for benefits section
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

// External scripts
export const TAILWIND_CDN_URL = "https://cdn.tailwindcss.com";



export const FAQS = [
    {
        question: "What is Custom Template Creation?",
        answer: "Custom Template Creation is a feature that allows you to create custom templates for your presentations.",
    },
    {
        question: "How do I create a custom template?",
        answer: "You can create a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
    {
        question: "How do I edit a custom template?",
        answer: "You can edit a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
    {
        question: "How do I delete a custom template?",
        answer: "You can delete a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
    {
        question: "How do I create a custom template?",
        answer: "You can create a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
    {
        question: "How do I edit a custom template?",
        answer: "You can edit a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
    {
        question: "How do I delete a custom template?",
        answer: "You can delete a custom template by uploading a PPTX file and then editing the template to your liking.",
    },
]