import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Product } from '../db/db'

export function useProducts(searchTerm = '', category = '') {
  const products = useLiveQuery(async () => {
    let query = db.products.orderBy('name')
    const all = await query.toArray()

    return all.filter((p) => {
      const matchSearch =
        !searchTerm ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode.includes(searchTerm)
      const matchCat = !category || p.category === category
      return matchSearch && matchCat
    })
  }, [searchTerm, category])

  return products ?? []
}

export async function addProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
  return db.products.add({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

export async function updateProduct(id: number, data: Partial<Product>) {
  return db.products.update(id, { ...data, updatedAt: new Date() })
}

export async function deleteProduct(id: number) {
  return db.products.delete(id)
}

export async function getProductByBarcode(barcode: string): Promise<Product | undefined> {
  return db.products.where('barcode').equals(barcode).first()
}

export async function decrementStock(productId: number, qty: number) {
  const p = await db.products.get(productId)
  if (p && p.quantity >= qty) {
    await db.products.update(productId, {
      quantity: p.quantity - qty,
      updatedAt: new Date(),
    })
  }
}
