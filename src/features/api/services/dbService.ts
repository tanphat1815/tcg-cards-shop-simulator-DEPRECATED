export class DBService {
  private static instance: DBService;
  private worker: Worker | null = null;
  private queryCallbacks: Map<number, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private queryId = 0;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.init();
  }

  public static getInstance(): DBService {
    if (!DBService.instance) {
      DBService.instance = new DBService();
    }
    return DBService.instance;
  }

  private _isReady = false;
  public get isReady() { return this._isReady; }

  private init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      // Set a hard timeout for DB initialization (5 seconds)
      const timeout = setTimeout(() => {
        reject(new Error('Database initialization timeout'));
      }, 5000);

      try {
        // Vite special syntax for workers
        this.worker = new Worker(
          new URL('./dbWorker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event) => {
          const { results, error, id, type: eventType } = event.data;

          if (eventType === 'INIT_SUCCESS') {
            console.log('🚀 DB Service: Worker initialized');
            clearTimeout(timeout);
            this._isReady = true;
            resolve();
            return;
          }

          if (eventType === 'INIT_ERROR') {
            clearTimeout(timeout);
            reject(new Error(error));
            return;
          }

          const callback = this.queryCallbacks.get(id);
          if (callback) {
            if (eventType === 'QUERY_SUCCESS') {
              callback.resolve(results);
            } else {
              callback.reject(new Error(error));
            }
            this.queryCallbacks.delete(id);
          }
        };

        this.worker.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Worker script error or not found'));
        };

        this.worker.postMessage({ type: 'INIT' });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    return this.initPromise;
  }

  public async query(sql: string, params: any[] = []): Promise<any[]> {
    try {
      await this.initPromise;
    } catch (err) {
      console.warn('DB Query failed because init failed:', err);
      return []; // Return empty results on init failure
    }

    return new Promise((resolve, reject) => {
      const id = ++this.queryId;
      this.queryCallbacks.set(id, { resolve, reject });
      
      this.worker?.postMessage({
        type: 'QUERY',
        sql,
        params,
        id
      });
    });
  }
}

export const dbService = DBService.getInstance();
