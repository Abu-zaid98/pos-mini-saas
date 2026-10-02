import { useState } from 'react'
import { Modal } from '../ui/Modal'
import {
  useCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
  type CategoryItem,
} from '../../hooks/useCategories'

interface CategoryManagerModalProps {
  open: boolean
  onClose: () => void
}

const POPULAR_EMOJIS = ['🥤', '🍿', '🧹', '🧀', '🍞', '🥩', '🍏', '💊', '🍫', '☕', '🥚', '🧴', '👕', '📦', '🏷️', '🛒']

export function CategoryManagerModal({ open, onClose }: CategoryManagerModalProps) {
  const categories = useCategories()
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('📦')
  const [editingCat, setEditingCat] = useState<CategoryItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('📦')
  const [error, setError] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!newCatName.trim()) {
      setError('يرجى إدخال اسم القسم')
      return
    }

    try {
      await addCategory(newCatName, newCatIcon)
      setNewCatName('')
      setNewCatIcon('📦')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const startEdit = (cat: CategoryItem) => {
    setEditingCat(cat)
    setEditName(cat.name)
    setEditIcon(cat.icon)
    setError('')
  }

  const handleSaveEdit = async () => {
    if (!editingCat || !editName.trim()) return
    try {
      await updateCategory(editingCat.id, editName, editIcon)
      setEditingCat(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (cat: CategoryItem) => {
    if (confirm(`هل أنت متأكد من حذف قسم "${cat.name}"؟ (سيتم نقل منتجاته تلقائياً إلى قسم "أخرى")`)) {
      await deleteCategory(cat.id)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🏷️ إدارة أقسام وتصنيفات المنتجات" type="box">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '80vh', overflowY: 'auto' }}>
        {error && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.15)',
            color: 'var(--color-danger-light)',
            fontSize: 13,
            fontWeight: 600,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Add Category Section */}
        <form onSubmit={handleAdd} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-light)' }}>
            + إضافة قسم جديد
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="اسم القسم (مثال: مثلجات)"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 10,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '0 8px',
            }}>
              <span style={{ fontSize: 18 }}>{newCatIcon}</span>
            </div>
            <button
              type="submit"
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                color: 'white',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                whiteSpace: 'nowrap',
              }}
            >
              إضافة
            </button>
          </div>

          {/* Quick emoji selector */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {POPULAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewCatIcon(emoji)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: newCatIcon === emoji ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: newCatIcon === emoji ? 'rgba(59,130,246,0.2)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </form>

        {/* Existing Categories List with Reordering */}
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>
            الأقسام الحالية (يمكنك تغيير ترتيبها بالأسهم ⬆️ ⬇️):
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {categories.map((cat, index) => {
              const isEditing = editingCat?.id === cat.id

              if (isEditing) {
                return (
                  <div
                    key={cat.id}
                    style={{
                      background: 'rgba(59,130,246,0.1)',
                      border: '1.5px solid var(--color-primary)',
                      borderRadius: 12,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                          fontSize: 14,
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 20, alignSelf: 'center' }}>{editIcon}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                      {POPULAR_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setEditIcon(emoji)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: editIcon === emoji ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                            background: editIcon === emoji ? 'rgba(59,130,246,0.3)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setEditingCat(null)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-secondary)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          background: 'var(--color-primary)',
                          border: 'none',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        حفظ التعديل
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{cat.name}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveCategory(cat.id, 'up')}
                      title="تحريك لأعلى"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--color-border)',
                        color: index === 0 ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ⬆️
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={index === categories.length - 1}
                      onClick={() => moveCategory(cat.id, 'down')}
                      title="تحريك لأسفل"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--color-border)',
                        color: index === categories.length - 1 ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        cursor: index === categories.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ⬇️
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      title="تعديل"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'rgba(59,130,246,0.15)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        cursor: 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ✏️
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDelete(cat)}
                      title="حذف"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        cursor: 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
