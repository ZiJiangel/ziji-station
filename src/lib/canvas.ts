
export type ElementType = 'text' | 'image' | 'rect' | 'music' | 'article_list';

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  opacity: number;
  rotation: number;
  
  // 内容属性
  content?: string;      // 文本内容
  src?: string;          // 图片链接
  bgColor?: string;      // 背景色
  fontSize?: number;     // 字号
  color?: string;        // 文字颜色
  borderRadius?: number; // 圆角

  // 动效属性
  animation?: 'none' | 'fade' | 'slideUp' | 'zoomIn';
  animDuration?: number;
  animDelay?: number;
}

export interface PageData {
  elements: CanvasElement[];
  background: string;
}

/** 默认模板：Akari 风格的基础名片 */
export const DEFAULT_TEMPLATE: PageData = {
  background: 'var(--paper)',
  elements: [
    {
      id: 'el-1', type: 'text', x: 200, y: 180, w: 400, h: 80, zIndex: 1, opacity: 1, rotation: 0,
      content: '你好，我是子骥。', fontSize: 48, color: 'var(--ink)', animation: 'slideUp', animDuration: 0.8, animDelay: 0.1
    },
    {
      id: 'el-2', type: 'text', x: 200, y: 280, w: 500, h: 100, zIndex: 1, opacity: 1, rotation: 0,
      content: '这里是我的个人主页。你可以在这里写下你的故事，分享你的文章与热爱。', fontSize: 18, color: 'var(--ink-2)', animation: 'fade', animDuration: 1, animDelay: 0.3
    },
    {
      id: 'el-3', type: 'rect', x: 200, y: 400, w: 200, h: 50, zIndex: 1, opacity: 1, rotation: 0,
      bgColor: 'var(--accent)', borderRadius: 25, animation: 'zoomIn', animDuration: 0.5, animDelay: 0.5
    },
    {
      id: 'el-4', type: 'text', x: 200, y: 400, w: 200, h: 50, zIndex: 2, opacity: 1, rotation: 0,
      content: '点击编辑我', fontSize: 16, color: '#fff', animation: 'zoomIn', animDuration: 0.5, animDelay: 0.5
    },
    {
      id: 'el-5', type: 'article_list', x: 800, y: 150, w: 400, h: 300, zIndex: 1, opacity: 1, rotation: 0,
      bgColor: 'var(--card)', borderRadius: 16, animation: 'slideUp', animDuration: 0.8, animDelay: 0.4
    }
  ]
};


export const TEMPLATES: Record<string, { name: string, data: PageData }> = {
  akari: {
    name: 'Akari 基础手账',
    data: DEFAULT_TEMPLATE
  },
  blog: {
    name: '极简博客风',
    data: {
      background: 'var(--paper)',
      elements: [
        { id: 'b1', type: 'text', x: 200, y: 120, w: 1040, h: 60, zIndex: 1, opacity: 1, rotation: 0, content: '记录与思考', fontSize: 36, color: 'var(--ink)', animation: 'slideUp', animDuration: 0.6, animDelay: 0 },
        { id: 'b2', type: 'text', x: 200, y: 190, w: 1040, h: 80, zIndex: 1, opacity: 1, rotation: 0, content: '在代码与文字之间寻找平衡。', fontSize: 18, color: 'var(--muted)', animation: 'fade', animDuration: 0.6, animDelay: 0.2 },
        { id: 'b3', type: 'article_list', x: 200, y: 300, w: 1040, h: 500, zIndex: 1, opacity: 1, rotation: 0, bgColor: 'var(--card)', borderRadius: 20, animation: 'slideUp', animDuration: 0.8, animDelay: 0.4 }
      ]
    }
  },
  gallery: {
    name: '画师画廊风',
    data: {
      background: 'var(--paper-2)',
      elements: [
        { id: 'g1', type: 'text', x: 600, y: 100, w: 240, h: 50, zIndex: 2, opacity: 1, rotation: 0, content: 'Gallery', fontSize: 28, color: 'var(--accent-deep)', animation: 'zoomIn', animDuration: 0.5, animDelay: 0 },
        { id: 'g2', type: 'image', x: 200, y: 200, w: 450, h: 300, zIndex: 1, opacity: 1, rotation: -2, src: '', borderRadius: 16, animation: 'slideUp', animDuration: 0.7, animDelay: 0.1 },
        { id: 'g3', type: 'image', x: 720, y: 220, w: 450, h: 300, zIndex: 1, opacity: 1, rotation: 2, src: '', borderRadius: 16, animation: 'slideUp', animDuration: 0.7, animDelay: 0.2 },
        { id: 'g4', type: 'image', x: 450, y: 520, w: 450, h: 300, zIndex: 1, opacity: 1, rotation: 0, src: '', borderRadius: 16, animation: 'slideUp', animDuration: 0.7, animDelay: 0.3 }
      ]
    }
  }
};

export function createElement(type: ElementType): CanvasElement {
  return {
    id: 'el-' + Math.random().toString(36).slice(2, 9),
    type,
    x: 200, y: 200, w: 300, h: 100,
    zIndex: 1, opacity: 1, rotation: 0,
    content: type === 'text' ? '双击编辑文本' : undefined,
    src: type === 'image' ? '' : undefined,
    bgColor: type === 'rect' ? 'var(--paper-2)' : undefined,
    fontSize: 16, color: 'var(--ink)', borderRadius: 8,
    animation: 'none', animDuration: 0.5, animDelay: 0
  };
}
