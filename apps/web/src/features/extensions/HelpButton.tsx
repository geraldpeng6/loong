import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle, ChevronRight } from "lucide-react";

const HelpSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h3 className="font-medium text-sm text-foreground flex items-center gap-1">
      <ChevronRight size={14} className="text-primary" />
      {title}
    </h3>
    <div className="pl-5 text-xs text-muted-foreground space-y-1.5">{children}</div>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-foreground">
    {children}
  </code>
);

const HelpButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="使用帮助"
        >
          <HelpCircle size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">使用指南</DialogTitle>
          <DialogDescription>快速了解 Agent、命令与扩展设置。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          {/* 快速开始 */}
          <HelpSection title="快速开始">
            <p>选择 Agent - 输入消息开始对话</p>
            <p className="text-[11px] text-muted-foreground/80">点击左上角头像切换不同 Agent</p>
          </HelpSection>

          {/* Agent 说明 */}
          <HelpSection title="Agent 介绍">
            <div className="space-y-2">
              <div>
                <p className="font-medium text-foreground">主调度 (main)</p>
                <p>智能分派任务给其他 Agent，适合复杂多步骤需求</p>
              </div>
              <div>
                <p className="font-medium text-foreground">女娲 (nuwa)</p>
                <p>创建和更新 Agent 与 Skill，系统开发者</p>
              </div>
              <div>
                <p className="font-medium text-foreground">仓颉 (cangjie)</p>
                <p>文档处理专家：PPT、PDF、Word、Excel</p>
              </div>
              <div>
                <p className="font-medium text-foreground">饕餮 (taotie)</p>
                <p>网络搜索与数据处理：爬取、整理、分析</p>
              </div>
              <div>
                <p className="font-medium text-foreground">囚牛 (qiuniu)</p>
                <p>音频与图像检索：搜索录音、图片内容</p>
              </div>
              <div>
                <p className="font-medium text-foreground">吴刚 (wugang)</p>
                <p>定时调度：设置周期性任务和心跳</p>
              </div>
            </div>
          </HelpSection>

          {/* 常用命令 */}
          <HelpSection title="常用命令">
            <div className="space-y-2">
              <div>
                <p className="font-medium text-foreground">切换 Agent</p>
                <p>
                  <Code>/agent Agent名称</Code> 快速切换
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">图片搜索</p>
                <p>
                  <Code>/img 关键词</Code> 搜索图片库
                </p>
                <p className="text-[11px]">
                  例：<Code>/img 猫咪</Code>、<Code>/img 风景 --top 5</Code>
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">音频搜索</p>
                <p>
                  <Code>/audio 关键词</Code> 搜索录音内容
                </p>
                <p className="text-[11px]">
                  例：<Code>/audio 会议</Code>、<Code>/audio 预算 --top 3</Code>
                </p>
              </div>
            </div>
          </HelpSection>

          {/* Extension 面板 */}
          <HelpSection title="Extension 设置">
            <p>
              点击右上角 <strong>Extension</strong> 按钮
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              <li>
                <strong>Image Pipeline</strong>：图片监控与搜索开关
              </li>
              <li>
                <strong>Audio Pipeline</strong>：音频监控与搜索开关
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              绿色 = 运行中，灰色 = 已停止
            </p>
          </HelpSection>

          {/* 快捷键 */}
          <HelpSection title="快捷键">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <p>
                <Code>Enter</Code> 发送消息
              </p>
              <p>
                <Code>Shift+Enter</Code> 换行
              </p>
              <p>
                <Code>↑</Code> 编辑上条消息
              </p>
              <p>
                <Code>Ctrl+L</Code> 清屏
              </p>
            </div>
          </HelpSection>

          {/* 参数说明 */}
          <HelpSection title="搜索参数">
            <div className="space-y-1 text-[11px]">
              <p>
                <Code>--top N</Code> 返回 N 个结果（默认 5）
              </p>
              <p>
                <Code>--min 0.8</Code> 最低相似度（-1 到 1）
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              例：<Code>/audio 预算 --top 3 --min 0.7</Code>
            </p>
          </HelpSection>

          {/* 注意事项 */}
          <div className="pt-2 border-t">
            <p className="text-[11px] text-muted-foreground/70">
              <strong>提示</strong>：搜索前确保 Extension 已开启，且文件已放入监控目录
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpButton;
