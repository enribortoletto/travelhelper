import { useState, type FormEvent } from "react";
import { createCategory, deleteCategory, updateCategory } from "../../lib/trips";
import type { Category } from "../../lib/types";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";

const DEFAULT_COLOR = "#465a54";

export function CategoryManager({
  tripId,
  categories,
  onChange,
}: {
  tripId: string;
  categories: Category[];
  onChange: (categories: Category[]) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name) return;
    setError(null);
    try {
      const category = await createCategory(tripId, { name, color });
      onChange([...categories, category]);
      setName("");
      setColor(DEFAULT_COLOR);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create category.");
    }
  }

  async function handleDelete(category: Category) {
    setError(null);
    try {
      await deleteCategory(category.id);
      onChange(categories.filter((c) => c.id !== category.id));
    } catch {
      setError(`"${category.name}" still has stops assigned — reassign or delete them first.`);
    }
  }

  async function handleRename(category: Category) {
    if (!renameValue || renameValue === category.name) {
      setRenaming(null);
      return;
    }
    setError(null);
    try {
      const updated = await updateCategory(category.id, { name: renameValue });
      onChange(categories.map((c) => (c.id === category.id ? updated : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename category.");
    } finally {
      setRenaming(null);
    }
  }

  return (
    <Card size="sm" className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        Categories
      </p>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-[10px] font-semibold text-bg"
            style={{ backgroundColor: cat.color }}
          >
            {renaming === cat.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(cat)}
                onKeyDown={(e) => e.key === "Enter" && handleRename(cat)}
                className="w-20 bg-transparent text-bg outline-none"
              />
            ) : (
              <button
                type="button"
                disabled={cat.is_system}
                onClick={() => {
                  setRenaming(cat.id);
                  setRenameValue(cat.name);
                }}
                className="capitalize disabled:cursor-default"
              >
                {cat.is_system && "🔒 "}
                {cat.name}
              </button>
            )}
            {!cat.is_system && (
              <button type="button" onClick={() => handleDelete(cat)} className="opacity-80">
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <TextField
          label="New category"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Shopping"
          className="flex-1"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-11 w-11 shrink-0 rounded-input border border-border-strong bg-bg"
        />
        <button type="submit" className="h-11 shrink-0 rounded-input bg-brand px-4 text-xs font-semibold text-bg">
          Add
        </button>
      </form>

      {error && <p className="text-xs text-accent">{error}</p>}
    </Card>
  );
}
