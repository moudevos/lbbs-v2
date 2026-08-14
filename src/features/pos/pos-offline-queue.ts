import type { PosCheckoutPayload } from "@/features/pos/pos-types";

const databaseName = "lbbs-pos-offline";
const storeName = "checkouts";

export type PendingPosCheckout = {
  id: string;
  createdAt: string;
  sessionId: string;
  payload: PosCheckoutPayload;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const request = action(database.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export function listPendingPosCheckouts() {
  return transact<PendingPosCheckout[]>("readonly", (store) => store.getAll());
}

export function enqueuePosCheckout(payload: PosCheckoutPayload) {
  const entry: PendingPosCheckout = {
    id: payload.idempotency_key,
    createdAt: new Date().toISOString(),
    sessionId: payload.pos_session_id,
    payload,
  };
  return transact("readwrite", (store) => store.put(entry));
}

export function removePendingPosCheckout(id: string) {
  return transact("readwrite", (store) => store.delete(id));
}
