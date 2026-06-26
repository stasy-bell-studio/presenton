import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  BulletsInlineEditor,
  SvgInlineEditor,
  TableInlineEditor,
  TextInlineEditor,
} from "../inline";
import {
  editingBulletsDraftAtom,
  editingBulletsElementAtom,
  editingBulletsIndexAtom,
  editingBulletsPathAtom,
  editingSvgDraftAtom,
  editingSvgElementAtom,
  editingSvgIndexAtom,
  editingSvgPathAtom,
  editingTableElementAtom,
  editingTableIndexAtom,
  editingTablePathAtom,
  editingTextElementAtom,
  editingTextIndexAtom,
  editingTextPathAtom,
  selectedTableCellAtom,
  updateElementAtPathAtom,
} from "../state";
import { rootPath } from "../lib/element-path";

type WorkspaceInlineEditorsProps = {
  scale: number;
};

export function WorkspaceInlineEditors({ scale }: WorkspaceInlineEditorsProps) {
  const editingTextElement = useAtomValue(editingTextElementAtom);
  const editingBulletsElement = useAtomValue(editingBulletsElementAtom);
  const editingTableElement = useAtomValue(editingTableElementAtom);
  const editingSvgElement = useAtomValue(editingSvgElementAtom);
  const selectedTableCell = useAtomValue(selectedTableCellAtom);
  const [editingTextIndex, setEditingTextIndex] = useAtom(editingTextIndexAtom);
  const [editingTextPath, setEditingTextPath] = useAtom(editingTextPathAtom);
  const [editingBulletsIndex, setEditingBulletsIndex] = useAtom(
    editingBulletsIndexAtom,
  );
  const [editingBulletsPath, setEditingBulletsPath] = useAtom(
    editingBulletsPathAtom,
  );
  const [editingBulletsDraft, setEditingBulletsDraft] = useAtom(
    editingBulletsDraftAtom,
  );
  const [editingTableIndex, setEditingTableIndex] = useAtom(
    editingTableIndexAtom,
  );
  const [editingTablePath, setEditingTablePath] = useAtom(editingTablePathAtom);
  const [editingSvgIndex, setEditingSvgIndex] = useAtom(editingSvgIndexAtom);
  const [editingSvgPath, setEditingSvgPath] = useAtom(editingSvgPathAtom);
  const [editingSvgDraft, setEditingSvgDraft] = useAtom(editingSvgDraftAtom);
  const updateElementAtPath = useSetAtom(updateElementAtPathAtom);

  return (
    <>
      {editingTextElement && editingTextIndex != null ? (
        <TextInlineEditor
          element={editingTextElement}
          index={editingTextIndex}
          scale={scale}
          onChange={(index, element) =>
            updateElementAtPath({
              path: editingTextPath ?? rootPath(index),
              element,
            })
          }
          onClose={() => {
            setEditingTextIndex(null);
            setEditingTextPath(null);
          }}
        />
      ) : null}
      {editingBulletsElement && editingBulletsIndex != null ? (
        <BulletsInlineEditor
          element={editingBulletsElement}
          index={editingBulletsIndex}
          scale={scale}
          draft={editingBulletsDraft}
          onDraftChange={setEditingBulletsDraft}
          onChange={(index, element) =>
            updateElementAtPath({
              path: editingBulletsPath ?? rootPath(index),
              element,
            })
          }
          onClose={() => {
            setEditingBulletsIndex(null);
            setEditingBulletsPath(null);
            setEditingBulletsDraft("");
          }}
        />
      ) : null}
      {editingTableElement && editingTableIndex != null ? (
        <TableInlineEditor
          element={editingTableElement}
          index={editingTableIndex}
          scale={scale}
          selectedCell={selectedTableCell}
          onChange={(index, element) =>
            updateElementAtPath({
              path: editingTablePath ?? rootPath(index),
              element,
            })
          }
          onClose={() => {
            setEditingTableIndex(null);
            setEditingTablePath(null);
          }}
        />
      ) : null}
      {editingSvgElement && editingSvgIndex != null ? (
        <SvgInlineEditor
          element={editingSvgElement}
          index={editingSvgIndex}
          scale={scale}
          draft={editingSvgDraft}
          onDraftChange={setEditingSvgDraft}
          onChange={(index, element) =>
            updateElementAtPath({
              path: editingSvgPath ?? rootPath(index),
              element,
            })
          }
          onClose={() => {
            setEditingSvgIndex(null);
            setEditingSvgPath(null);
            setEditingSvgDraft("");
          }}
        />
      ) : null}
    </>
  );
}
