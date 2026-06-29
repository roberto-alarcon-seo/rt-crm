import { MessageText } from "./MessageText";
import { MessageTable } from "./MessageTable";
import { MessageChart } from "./MessageChart";
import { MessageInsight } from "./MessageInsight";
import { MessageActionConfirm } from "./MessageActionConfirm";
import { MessageLoading } from "./MessageLoading";
import { MessageError } from "./MessageError";
import { MessageList } from "./MessageList";
import { MessageDailySummary } from "./MessageDailySummary";
import type { AIMessageContent } from "@/hooks/useAIMessages";

interface Props {
  content: AIMessageContent;
  onConfirmAction?: () => Promise<void>;
  onCancelAction?: () => void;
}

export function MessageRenderer({ content, onConfirmAction, onCancelAction }: Props) {
  const data = content.data as any;

  switch (content.type) {
    case "text":
      return <MessageText text={content.text ?? ""} />;

    case "report-chart":
      return (
        <div className="flex flex-col gap-4">
          {content.text && <MessageText text={content.text} />}
          {data?.chartData && (
            <MessageChart
              chartType={content.chartType ?? "bar"}
              data={data.chartData}
              dataKey={data.dataKeys ? undefined : (data.dataKey ?? "value")}
              dataKeys={data.dataKeys}
              nameKey={data.nameKey ?? "name"}
              title={data.chartTitle}
              color={data.color}
            />
          )}
          {data?.columns && data?.rows && (
            <MessageTable
              columns={data.columns}
              rows={data.rows}
              caption={data.caption}
              pageSize={data.pageSize}
            />
          )}
        </div>
      );

    case "table":
      return (
        <div className="flex flex-col gap-3">
          {content.text && <MessageText text={content.text} />}
          {data?.columns && data?.rows && (
            <MessageTable
              columns={data.columns}
              rows={data.rows}
              caption={data.caption}
              pageSize={data.pageSize}
            />
          )}
        </div>
      );

    case "insight":
      return (
        <div className="flex flex-col gap-3">
          {content.text && <MessageText text={content.text} />}
          {Array.isArray(data?.insights) ? (
            <div className="grid grid-cols-2 gap-2">
              {data.insights.map((ins: any, i: number) => (
                <MessageInsight key={i} {...ins} />
              ))}
            </div>
          ) : data?.label ? (
            <MessageInsight {...data} />
          ) : null}
        </div>
      );

    case "action-confirm":
      return (
        <MessageActionConfirm
          title={data?.title ?? "Confirmar acción"}
          summary={data?.summary ?? ""}
          actions={data?.actions}
          confirmed={data?.confirmed}
          cancelled={data?.cancelled}
          onConfirm={onConfirmAction ?? (() => Promise.resolve())}
          onCancel={onCancelAction ?? (() => {})}
        />
      );

    case "list":
      return (
        <div className="flex flex-col gap-3">
          {content.text && <MessageText text={content.text} />}
          {Array.isArray(data?.items) && (
            <MessageList items={data.items} title={data.title} />
          )}
        </div>
      );

    case "insight-daily":
      return <MessageDailySummary text={content.text} data={data} />;

    case "loading":
      return <MessageLoading />;

    case "error":
      return (
        <MessageError
          message={content.text ?? "Ocurrió un error"}
          suggestion={data?.suggestion}
        />
      );

    default:
      return <MessageText text={content.text ?? ""} />;
  }
}
