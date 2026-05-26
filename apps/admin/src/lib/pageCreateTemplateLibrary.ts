export type PageTemplateLibraryCategory = 'all' | 'essentials' | 'commerce' | 'content' | 'forms' | 'legal' | 'members';

export interface PageTemplateLibraryOption<TTemplate extends string = string> {
    id: TTemplate;
    name: string;
    desc: string;
    detail: string;
    sections: string[];
}

export const PAGE_TEMPLATE_LIBRARY_CATEGORIES: Array<{
    id: PageTemplateLibraryCategory;
    label: string;
    templates?: string[];
}> = [
    { id: 'all', label: 'All' },
    {
        id: 'essentials',
        label: 'Essentials',
        templates: ['blank', 'landing', 'about', 'contact', 'team', 'careers'],
    },
    {
        id: 'commerce',
        label: 'Commerce',
        templates: ['storefront', 'product-detail', 'pricing', 'cart', 'checkout', 'order-confirmation', 'refund-policy', 'shipping-policy'],
    },
    {
        id: 'content',
        label: 'Content',
        templates: ['blog-index', 'blog-post', 'portfolio', 'gallery', 'events', 'testimonials', 'help-center', 'faq'],
    },
    {
        id: 'forms',
        label: 'Forms',
        templates: ['contact', 'newsletter', 'survey', 'registration', 'booking', 'services'],
    },
    {
        id: 'legal',
        label: 'Legal',
        templates: ['privacy', 'terms', 'cookie-policy', 'accessibility-statement', 'refund-policy', 'shipping-policy'],
    },
    {
        id: 'members',
        label: 'Members',
        templates: ['registration', 'member-login', 'member-account'],
    },
];

export function getVisiblePageTemplateOptions<TTemplate extends string>(
    templates: Array<PageTemplateLibraryOption<TTemplate>>,
    categoryId: PageTemplateLibraryCategory,
    searchQuery: string,
) {
    const category = PAGE_TEMPLATE_LIBRARY_CATEGORIES.find((item) => item.id === categoryId) || PAGE_TEMPLATE_LIBRARY_CATEGORIES[0];
    const categoryTemplateIds = category.templates ? new Set(category.templates) : null;
    const query = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
        if (categoryTemplateIds && !categoryTemplateIds.has(template.id)) {
            return false;
        }

        if (!query) {
            return true;
        }

        return [
            template.id,
            template.name,
            template.desc,
            template.detail,
            ...template.sections,
        ].join(' ').toLowerCase().includes(query);
    });
}
