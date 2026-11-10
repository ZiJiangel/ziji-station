
export type BlockType = 'profile' | 'markdown' | 'links' | 'articles' | 'moments' | 'gallery';

export interface BaseBlock {
  id: string;
  type: BlockType;
  visible: boolean;
}

export interface ProfileBlock extends BaseBlock {
  type: 'profile';
  props: { avatar?: string; name?: string; bio?: string; status?: string; };
}

export interface MarkdownBlock extends BaseBlock {
  type: 'markdown';
  props: { content: string; };
}

export interface LinksBlock extends BaseBlock {
  type: 'links';
  props: { links: Array<{ label: string; url: string }>; };
}

export interface ArticlesBlock extends BaseBlock {
  type: 'articles';
  props: { limit: number; layout: 'list' | 'card'; };
}

export interface MomentsBlock extends BaseBlock {
  type: 'moments';
  props: { limit: number; };
}

export interface GalleryBlock extends BaseBlock {
  type: 'gallery';
  props: { images: Array<{ url: string; caption?: string }>; columns: number; };
}

export type Block = ProfileBlock | MarkdownBlock | LinksBlock | ArticlesBlock | MomentsBlock | GalleryBlock;

export interface PageData {
  blocks: Block[];
  // 移除背景色，让设计统一由渲染器决定
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  profile: '个人名片',
  markdown: '富文本简介',
  links: '社交链接',
  articles: '文章聚合',
  moments: '碎碎念',
  gallery: '相册画廊',
};

/** 新建区块时的默认属性 */
export function createDefaultBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'profile': return { id, type, visible: true, props: { name: '', bio: '', status: '' } };
    case 'markdown': return { id, type, visible: true, props: { content: '## 关于我\n\n你好，欢迎来到我的主页。' } };
    case 'links': return { id, type, visible: true, props: { links: [{ label: 'GitHub', url: 'https://github.com' }] } };
    case 'articles': return { id, type, visible: true, props: { limit: 5, layout: 'list' } };
    case 'moments': return { id, type, visible: true, props: { limit: 5 } };
    case 'gallery': return { id, type, visible: true, props: { images: [], columns: 3 } };
  }
}

/** 系统预设模板：让新用户进来不至于是一片空白 */
export function getTemplates(): Record<string, { name: string, desc: string, data: PageData }> {
  return {
    empty: {
      name: '空白起步',
      desc: '一张白纸，自由发挥',
      data: { blocks: [createDefaultBlock('profile', 'b1')] }
    },
    blogger: {
      name: '文字博客',
      desc: '适合喜欢写长文的创作者',
      data: {
        blocks: [
          { id: 'p1', type: 'profile', visible: true, props: { name: '某某某', bio: '记录思考，分享生活', status: '在敲代码' } },
          { id: 'm1', type: 'markdown', visible: true, props: { content: '## 欢迎来到我的小站\n\n这里是我个人的一片自留地。你可以在这里写下你的故事、你的思考，或者是昨天做的一个好梦。' } },
          { id: 'a1', type: 'articles', visible: true, props: { limit: 5, layout: 'list' } }
        ]
      }
    },
    creator: {
      name: '创作者展台',
      desc: '适合画师、摄影师和设计师',
      data: {
        blocks: [
          { id: 'p2', type: 'profile', visible: true, props: { name: 'Artist', bio: '捕捉光影的瞬间', status: '' } },
          { id: 'g1', type: 'gallery', visible: true, props: { images: [], columns: 2 } },
          { id: 'mk1', type: 'markdown', visible: true, props: { content: '### 合作联系\n\n可通过社交链接联系我。' } }
        ]
      }
    }
  };
}
