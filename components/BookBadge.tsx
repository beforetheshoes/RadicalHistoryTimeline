import type { Book } from "@/lib/types";

type Props = {
  book: Book;
  size?: "sm" | "md";
  align?: "left" | "right";
  showAuthor?: boolean;
};

/**
 * A small chip displaying the book's short name with its color dot.
 * Used wherever an event needs to be visually attributed to its book.
 */
export default function BookBadge({
  book,
  size = "sm",
  align = "left",
  showAuthor = false,
}: Props) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <span
      className={`font-sans ${textSize} uppercase tracking-[0.12em] font-semibold inline-flex items-center gap-1.5 ${padding} rounded-sm whitespace-nowrap`}
      style={{
        color: book.color,
        backgroundColor: `${book.color}14`, // 8% opacity tint
        flexDirection: align === "right" ? "row-reverse" : "row",
      }}
      title={`${book.title} — ${book.author}`}
    >
      <span
        className={`${dotSize} rounded-full inline-block`}
        style={{ backgroundColor: book.color }}
      />
      <span>{book.shortName}</span>
      {showAuthor && (
        <span className="font-normal opacity-70 normal-case tracking-normal">
          · {book.author.split(/[,&]/)[0].trim().split(" ").pop()}
        </span>
      )}
    </span>
  );
}
