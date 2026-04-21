import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Api } from '../lib/api';
import { usePriceLabels } from '../lib/priceLabels';
import Skeleton from '../ui/Skeleton';

type CatalogoConfig = {
  nombre?: string;
  logo_url?: string;
  destacado_producto_id?: number | null;
  price_type?: 'final' | 'distribuidor' | 'mayorista';
};

type Categoria = {
  id: number;
  name: string;
  image_url?: string | null;
  description?: string | null;
};

type Producto = {
  id: number;
  category_id: number;
  category_name?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price?: number | null;
  price_local?: number | null;
  price_distribuidor?: number | null;
  precio_final?: number | null;
};

type CatalogoData = {
  config?: CatalogoConfig;
  destacado?: Producto | null;
  categorias?: Categoria[];
  productos?: Producto[];
};

export default function CatalogoPublico() {
  const { labels: priceLabels } = usePriceLabels();
  const [data, setData] = useState<CatalogoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(0);
  const [priceType, setPriceType] = useState<'final' | 'distribuidor' | 'mayorista'>('final');
  const productsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await Api.catalogoPublico();
        if (!mounted) return;
        setData(res as CatalogoData);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar el catalogo');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (data?.config?.price_type) {
      setPriceType(data.config.price_type as any);
    }
  }, [data?.config?.price_type]);

  const categories = data?.categorias || [];
  const products = data?.productos || [];

  const productsByCategory = useMemo(() => {
    const map = new Map<number, Producto[]>();
    for (const p of products) {
      const list = map.get(p.category_id) || [];
      list.push(p);
      map.set(p.category_id, list);
    }
    return map;
  }, [products]);

  const filteredCategories = useMemo(() => {
    if (!activeCategoryId) return categories;
    return categories.filter((c) => c.id === activeCategoryId);
  }, [categories, activeCategoryId]);

  function selectCategory(id: number) {
    setActiveCategoryId(id);
    setMenuOpen(false);
    if (productsRef.current) {
      productsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const hasProductsForFilter = useMemo(() => {
    if (!filteredCategories.length) return false;
    return filteredCategories.some((cat) => (productsByCategory.get(cat.id) || []).length > 0);
  }, [filteredCategories, productsByCategory]);

  const config = data?.config || {};

  function resolvePrice(p: Producto) {
    if (priceType === 'distribuidor') {
      return p.price_local ?? p.price ?? p.precio_final ?? 0;
    }
    if (priceType === 'mayorista') {
      return p.price_distribuidor ?? p.price ?? p.precio_final ?? 0;
    }
    return p.precio_final ?? p.price ?? 0;
  }

  if (loading) {
    return (
      <div className="catalogo-root">
        <div className="catalogo-ambient" aria-hidden="true">
          <span className="catalogo-orb orb-a" />
          <span className="catalogo-orb orb-b" />
          <span className="catalogo-orb orb-c" />
        </div>
        <div className="catalogo-container">
          <header className="catalogo-header">
            <div className="catalogo-brand">
              <Skeleton className="h-12 w-12" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </header>
          <main className="catalogo-main">
            <div className="catalogo-hero">
              <div className="space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-12 w-36" />
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
            <div className="catalogo-chips">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="catalogo-root catalogo-error">
        <div>{error}</div>
      </div>
    );
  }

  return (
    <div className="catalogo-root">
      <div className="catalogo-ambient" aria-hidden="true">
        <span className="catalogo-orb orb-a" />
        <span className="catalogo-orb orb-b" />
        <span className="catalogo-orb orb-c" />
      </div>
      <div className="catalogo-container">
        <header className="catalogo-header">
          <div className="catalogo-brand">
            {config.logo_url ? (
              <img
                src={config.logo_url}
                alt={config.nombre || 'Catalogo'}
                className="catalogo-logo"
              />
            ) : (
              <div className="catalogo-logo catalogo-logo-fallback">LOGO</div>
            )}
            <div>
              <div className="catalogo-title">
                {config.nombre || 'Catalogo'}
              </div>
              <div className="catalogo-subtitle">
                Tecnologia lista para entregar hoy
              </div>
            </div>
          </div>

          <div className="catalogo-actions">
            <a className="catalogo-link" href="/cliente/login">
              Ingresar
            </a>
            <a className="catalogo-cta" href="/cliente/registro">
              Crear cuenta
            </a>
            <button
              type="button"
              className={`catalogo-hamburger ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Abrir menu de categorias"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>

        <main className="catalogo-main">
          <section className="catalogo-hero">
            <div className="catalogo-hero-text">
              <div className="catalogo-eyebrow">Catalogo premium</div>
              <h1>
                Equipos que se venden solos,
                <span className="catalogo-highlight"> listos para cotizar.</span>
              </h1>
              <p className="catalogo-muted">
                Explora las categorias y compara specs reales. Cada producto muestra el
                precio final y sus detalles clave para decidir rapido.
              </p>
              <div className="catalogo-hero-actions">
                <button
                  type="button"
                  className="catalogo-cta"
                  onClick={() => {
                    if (productsRef.current) {
                      productsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                >
                  Ver novedades
                </button>
                <button
                  type="button"
                  className="catalogo-secondary"
                  onClick={() => selectCategory(0)}
                >
                  Ver todas las categorias
                </button>
              </div>
            </div>
            {data?.destacado && (
              <motion.div
                className="catalogo-hero-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="catalogo-card-label">Producto destacado</div>
                {data.destacado.image_url ? (
                  <img
                    src={data.destacado.image_url}
                    alt={data.destacado.name}
                    className="catalogo-hero-image"
                  />
                ) : (
                  <div className="catalogo-hero-image catalogo-image-fallback">Sin imagen</div>
                )}
                <div className="catalogo-hero-info">
                  <div className="catalogo-hero-name">{data.destacado.name}</div>
                  <div className="catalogo-hero-desc">
                    {data.destacado.description || 'Disenado para vender mas rapido.'}
                  </div>
                  <div className="catalogo-price">
                    ${resolvePrice(data.destacado).toFixed(2)}
                  </div>
                </div>
              </motion.div>
            )}
          </section>

          <div className="catalogo-chips">
            <button
              type="button"
              className={`catalogo-chip ${priceType === 'final' ? 'active' : ''}`}
              onClick={() => setPriceType('final')}
            >
              {priceLabels.final}
            </button>
            <button
              type="button"
              className={`catalogo-chip ${priceType === 'distribuidor' ? 'active' : ''}`}
              onClick={() => setPriceType('distribuidor')}
            >
              {priceLabels.local}
            </button>
            <button
              type="button"
              className={`catalogo-chip ${priceType === 'mayorista' ? 'active' : ''}`}
              onClick={() => setPriceType('mayorista')}
            >
              {priceLabels.distribuidor}
            </button>
          </div>

          <div className="catalogo-chips">
            <button
              type="button"
              className={`catalogo-chip ${activeCategoryId === 0 ? 'active' : ''}`}
              onClick={() => selectCategory(0)}
            >
              Todo
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`catalogo-chip ${activeCategoryId === cat.id ? 'active' : ''}`}
                onClick={() => selectCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div ref={productsRef} className="space-y-10">
            {filteredCategories.map((cat) => {
              const list = productsByCategory.get(cat.id) || [];
              if (!list.length) return null;
              return (
                <section key={cat.id} className="space-y-4">
                  <div className="catalogo-section-title">
                    <div>
                      <div className="catalogo-section-name">{cat.name}</div>
                      {cat.description && (
                        <div className="catalogo-muted text-sm">{cat.description}</div>
                      )}
                    </div>
                    <span className="catalogo-count">{list.length} productos</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {list.map((p, index) => (
                      <motion.article
                        key={p.id}
                        className="catalogo-card"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.35, delay: index * 0.03 }}
                      >
                        <div className="catalogo-card-image">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} />
                          ) : (
                            <div className="catalogo-image-fallback">Sin imagen</div>
                          )}
                        </div>
                        <div className="catalogo-card-body">
                          <div className="catalogo-card-name">{p.name}</div>
                          {p.description && (
                            <div className="catalogo-card-desc">{p.description}</div>
                          )}
                          <div className="catalogo-card-footer">
                            <div className="catalogo-price">
                              ${resolvePrice(p).toFixed(2)}
                            </div>
                            <span className="catalogo-badge">Disponible ahora</span>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                </section>
              );
            })}
            {!filteredCategories.length && (
              <div className="catalogo-empty">No hay productos para esta categoria.</div>
            )}
          </div>
        </main>

        <footer className="catalogo-footer">
          <div>Catalogo publico siempre visible.</div>
          <div>Actualizado desde el ERP.</div>
        </footer>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.aside
            className="catalogo-menu"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="catalogo-menu-header">
              <div>
                <div className="catalogo-menu-title">Categorias</div>
                <div className="catalogo-muted text-xs">Filtra con un toque</div>
              </div>
              <button
                type="button"
                className="catalogo-menu-close"
                onClick={() => setMenuOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="catalogo-menu-list">
              <button
                type="button"
                className={`catalogo-menu-item ${activeCategoryId === 0 ? 'active' : ''}`}
                onClick={() => selectCategory(0)}
              >
                Todo
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`catalogo-menu-item ${activeCategoryId === cat.id ? 'active' : ''}`}
                  onClick={() => selectCategory(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
