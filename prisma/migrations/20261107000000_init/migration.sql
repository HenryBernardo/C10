-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "c10_cities" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "c10_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "c10_categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "c10_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "c10_businesses" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "hours" JSONB NOT NULL DEFAULT '{}',
    "booking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "c10_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "c10_leads" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER,
    "category_id" INTEGER,
    "business_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "c10_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "city_id" INTEGER,
    "business_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "hit_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_settings" (
    "shop_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("shop_id","key")
);

-- CreateTable
CREATE TABLE "barbers" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "commission_pct" REAL NOT NULL DEFAULT 50,
    "color" TEXT NOT NULL DEFAULT '#c8a24a',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "barbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_hours" (
    "barber_id" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "break_start" INTEGER,
    "break_end" INTEGER,

    CONSTRAINT "barber_hours_pkey" PRIMARY KEY ("barber_id","weekday")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_min" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "barber_id" INTEGER,
    "date_start" DATE NOT NULL,
    "date_end" DATE NOT NULL,
    "start_min" INTEGER NOT NULL DEFAULT 0,
    "end_min" INTEGER NOT NULL DEFAULT 1440,
    "reason" TEXT,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "barber_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "source" TEXT NOT NULL DEFAULT 'online',
    "payment" TEXT,
    "notes" TEXT,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_entries" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "stamps" INTEGER NOT NULL,
    "reward" TEXT,
    "appointment_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "c10_cities_slug_key" ON "c10_cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "c10_categories_slug_key" ON "c10_categories"("slug");

-- CreateIndex
CREATE INDEX "idx_c10_biz_city" ON "c10_businesses"("city_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "c10_businesses_city_id_slug_key" ON "c10_businesses"("city_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_rate_limits" ON "rate_limits"("key", "hit_at");

-- CreateIndex
CREATE UNIQUE INDEX "clients_shop_id_phone_key" ON "clients"("shop_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_code_key" ON "appointments"("code");

-- CreateIndex
CREATE INDEX "idx_appt_barber_date" ON "appointments"("barber_id", "date");

-- CreateIndex
CREATE INDEX "idx_appt_shop_date" ON "appointments"("shop_id", "date");

-- CreateIndex
CREATE INDEX "idx_appt_client" ON "appointments"("client_id");

-- CreateIndex
CREATE INDEX "idx_loyalty_client" ON "loyalty_entries"("client_id", "id");

-- AddForeignKey
ALTER TABLE "c10_businesses" ADD CONSTRAINT "c10_businesses_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "c10_cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "c10_businesses" ADD CONSTRAINT "c10_businesses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "c10_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "c10_leads" ADD CONSTRAINT "c10_leads_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "c10_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "c10_leads" ADD CONSTRAINT "c10_leads_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "c10_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "c10_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "c10_businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_hours" ADD CONSTRAINT "barber_hours_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "c10_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security ligado e sem políticas: a API pública do Supabase (chave anon) não enxerga
-- nenhuma tabela. Só o servidor do site, que conecta como dono do banco, acessa os dados.
ALTER TABLE "c10_cities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "c10_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "c10_businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "c10_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shop_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "barbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "barber_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
