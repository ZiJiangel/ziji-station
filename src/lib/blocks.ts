/**
 * 区块数据模型
 * 编辑器产出 PageData，公开主页消费 PageData
 * 两者共用同一套类型，保证契约一致
 */

export type BlockType = 'profile' | 'markdown' | 'links' | 'articles' | 'moments' | 'gallery';

export interface BaseBlock {
  id: string;
  type: BlockType;
  visible: boolean;
}

export interface ProfileBlock extends BaseBlock {
  type: 'profile';
  props: {
    avatar?: string;
    name?: string;
    bio?: string;
    status?: string;
  };
}

export interface MarkdownBlock extends BaseBlock {
  type: 'markdown';
  props: {
    content: string;
  };
}

export interface LinksBlock extends BaseBlock {
  type: 'links';
  props: {
    links: Array<{ label: string; url: string }>;
  };
}

export interface ArticlesBlock extends BaseBlock {
  type: 'articles';
  props: {
    limit: number;
    layout: 'list' | 'card';
  };
}

export interface MomentsBlock extends BaseBlock {
  type: 'moments';
  props: {
    limit: number;
  };
}

export interface GalleryBlock extends BaseBlock {
  type: 'gallery';
  props: {
    images: Array<{ url: string; caption?: string }>;
    columns: number;
  };
}

export type Block =
  | ProfileBlock
  | MarkdownBlock
  | LinksBlock
  | ArticlesBlock
  | MomentsBlock
  | GalleryBlock;

export interface PageData {
  blocks: Block[];
}

/** 新建区块时的默认 props */
export function createDefaultBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'profile':
      return { id, type, visible: true, props: { name: '', bio: '', status: '' } };
    case 'markdown':
      return { id, type, visible: true, props: { content: '## 你好\n\n在这里写点自我介绍吧。' } };
    case 'links':
      return { id, type, visible: true, props: { links: [{ label: 'GitHub', url: 'https://github.com' }] } };
    case 'articles':
      return { id, type, visible: true, props: { limit: 5, layout: 'list' } };
    case 'moments':
      return { id, type, visible: true, props: { limit: 10 } };
    case 'gallery':
      return { id, type, visible: true, props: { images: [], columns: 3 } };
  }
}

/** 区块类型的中文名（编辑器面板用） */
export const BLOCK_LABELS: Record<BlockType, string> = {
  profile: '头像卡片',
  markdown: '富文本',
  links: '社交链接',
  articles: '文章列表',
  moments: '碎碎念',
  gallery: '相册',
};
