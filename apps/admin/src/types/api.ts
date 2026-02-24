/**
 * ============================================================================
 * BACKY CMS - PAGE API TYPES
 * ============================================================================
 * 
 * This file defines the API contract between the CMS backend and any frontend.
 * Frontend applications should use these types to read/render page data.
 * 
 * Key Architecture:
 * - CMS stores page structure as JSON with elements at X/Y coordinates
 * - Frontend fetches this JSON and renders each element with its own UI/UX
 * - All styling info (fonts, colors, sizes) is in the props
 * 
 * @module PageAPI
 * @version 1.0.0
 */

// ============================================
// ELEMENT TYPES
// ============================================

export type ElementType =
    | 'text'
    | 'heading'
    | 'paragraph'
    | 'image'
    | 'video'
    | 'button'
    | 'link'
    | 'input'
    | 'box'
    | 'container'
    | 'divider'
    | 'spacer'
    | 'list'
    | 'quote'
    | 'embed'
    | 'form'
    | 'icon'
    | 'columns'
    | 'map';

// ============================================
// PAGE ELEMENT (Frontend-readable format)
// ============================================

export interface PageElement {
    id: string;
    type: ElementType;
    name?: string; // User-given name for the element

    // Position and Size (absolute positioning)
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    zIndex: number;

    // Element-specific properties
    props: ElementProps;

    // Optional direct CSS styles override
    styles?: Record<string, string | number>;
}

export interface ElementProps {
    // ===== TEXT/CONTENT =====
    content?: string;      // HTML content for text, heading, quote, link
    level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; // Heading level
    label?: string;        // Button label

    // ===== TYPOGRAPHY =====
    fontFamily?: string;   // CSS font-family value (e.g., "Inter, sans-serif")
    fontSize?: number;     // Font size in pixels
    fontWeight?: string;   // CSS font-weight value
    lineHeight?: number;   // Line height multiplier
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    color?: string;        // Text color (hex)

    // ===== BACKGROUND/BORDER =====
    backgroundColor?: string;  // Background color (hex)
    borderRadius?: number;     // Border radius in pixels
    borderColor?: string;      // Border color (hex)
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    border?: string;           // Full CSS border value
    opacity?: number;          // 0-1 opacity

    // ===== MEDIA =====
    src?: string;          // Image/Video/Embed URL
    alt?: string;          // Image alt text
    objectFit?: 'cover' | 'contain' | 'fill' | 'none';
    autoplay?: boolean;    // Video autoplay

    // ===== LINKS/ACTIONS =====
    href?: string;         // Link/Button URL
    underline?: boolean;   // Link underline
    actionUrl?: string;    // Form submit URL

    // ===== INPUT =====
    placeholder?: string;  // Input placeholder
    inputType?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';

    // ===== LIST =====
    items?: string[];      // List items
    listType?: 'bullet' | 'number';

    // ===== LAYOUT =====
    columns?: number;      // Columns count for columns element
    gap?: number;          // Gap between columns in pixels

    // ===== MAP =====
    address?: string;      // Map address
    zoom?: number;         // Map zoom level (1-20)

    // ===== FORM =====
    formTitle?: string;    // Form title

    // ===== ICON =====
    icon?: string;         // Emoji or Unicode symbol
    size?: number;         // Icon size in pixels

    // Allow custom props for extensibility
    [key: string]: unknown;
}

// ============================================
// PAGE DATA (API Response)
// ============================================

export interface PageData {
    id: string;
    siteId: string;
    title: string;
    slug: string;
    status: 'draft' | 'published';
    template?: string;

    // Canvas configuration
    canvas: {
        width: number;
        height: number;
        breakpoints?: {
            desktop: { width: number; height: number };
            tablet: { width: number; height: number };
            mobile: { width: number; height: number };
        };
    };

    // Page elements - the main content
    elements: PageElement[];

    // SEO Metadata
    meta: {
        title?: string;
        description?: string;
        keywords?: string[];
        ogImage?: string;
    };

    // Custom fonts used on this page (for frontend to load)
    fonts?: string[];

    // Custom CSS (optional)
    customCss?: string;

    // Timestamps
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
}

// ============================================
// API ENDPOINTS SPEC
// ============================================

/**
 * GET /api/pages/:pageId
 * 
 * Returns the full page data for rendering.
 * 
 * Response: PageData
 */

/**
 * GET /api/sites/:siteId/pages
 * 
 * Returns all pages for a site.
 * 
 * Response: { pages: PageData[] }
 */

/**
 * GET /api/pages/:pageId/elements
 * 
 * Returns just the elements array (lightweight).
 * 
 * Response: { elements: PageElement[] }
 */

/**
 * POST /api/pages
 * 
 * Create a new page.
 * 
 * Body: Partial<PageData>
 * Response: PageData
 */

/**
 * PUT /api/pages/:pageId
 * 
 * Update an existing page (full replace).
 * 
 * Body: Partial<PageData>
 * Response: PageData
 */

/**
 * PATCH /api/pages/:pageId/elements
 * 
 * Update just the elements array.
 * 
 * Body: { elements: PageElement[] }
 * Response: PageData
 */

// ============================================
// FRONTEND RENDERING GUIDE
// ============================================

/**
 * RENDERING STRATEGY:
 * 
 * 1. Fetch page data from API
 * 2. Load any custom fonts specified in `fonts` array
 * 3. Create a container with canvas dimensions
 * 4. For each element, render an absolutely positioned div at (x, y)
 * 5. Inside each div, render the element based on its type and props
 * 
 * EXAMPLE (React):
 * 
 * ```tsx
 * function PageRenderer({ pageData }: { pageData: PageData }) {
 *   return (
 *     <div 
 *       style={{ 
 *         position: 'relative', 
 *         width: pageData.canvas.width,
 *         minHeight: pageData.canvas.height 
 *       }}
 *     >
 *       {pageData.elements.map(element => (
 *         <div
 *           key={element.id}
 *           style={{
 *             position: 'absolute',
 *             left: element.x,
 *             top: element.y,
 *             width: element.width,
 *             height: element.height,
 *             transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
 *             zIndex: element.zIndex,
 *           }}
 *         >
 *           <ElementRenderer element={element} />
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * 
 * function ElementRenderer({ element }: { element: PageElement }) {
 *   switch (element.type) {
 *     case 'text':
 *     case 'paragraph':
 *       return (
 *         <div 
 *           style={{ 
 *             fontFamily: element.props.fontFamily,
 *             fontSize: element.props.fontSize,
 *             color: element.props.color,
 *           }}
 *           dangerouslySetInnerHTML={{ __html: element.props.content || '' }}
 *         />
 *       );
 *     
 *     case 'heading':
 *       const Tag = element.props.level || 'h2';
 *       return (
 *         <Tag style={{ fontFamily: element.props.fontFamily }}>
 *           {element.props.content}
 *         </Tag>
 *       );
 *     
 *     case 'image':
 *       return (
 *         <img 
 *           src={element.props.src} 
 *           alt={element.props.alt}
 *           style={{ 
 *             width: '100%', 
 *             height: '100%', 
 *             objectFit: element.props.objectFit 
 *           }}
 *         />
 *       );
 *     
 *     case 'button':
 *       return (
 *         <a href={element.props.href}>
 *           <button style={{ 
 *             backgroundColor: element.props.backgroundColor,
 *             color: element.props.color,
 *           }}>
 *             {element.props.label}
 *           </button>
 *         </a>
 *       );
 *     
 *     case 'video':
 *       return <video src={element.props.src} controls />;
 *     
 *     case 'input':
 *       return (
 *         <input 
 *           type={element.props.inputType}
 *           placeholder={element.props.placeholder}
 *         />
 *       );
 *     
 *     case 'link':
 *       return (
 *         <a 
 *           href={element.props.href}
 *           style={{ color: element.props.color }}
 *         >
 *           {element.props.content}
 *         </a>
 *       );
 *     
 *     // ... handle other types
 *     
 *     default:
 *       return null;
 *   }
 * }
 * ```
 * 
 * LOADING FONTS:
 * 
 * ```tsx
 * // Load Google Fonts dynamically
 * function loadFonts(fonts: string[]) {
 *   const link = document.createElement('link');
 *   link.rel = 'stylesheet';
 *   link.href = `https://fonts.googleapis.com/css2?${
 *     fonts.map(f => `family=${encodeURIComponent(f.split(',')[0])}`).join('&')
 *   }&display=swap`;
 *   document.head.appendChild(link);
 * }
 * ```
 */

export { };
