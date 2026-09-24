-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentVersionId" UUID,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorOid" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRisk" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sinceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorOid" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ProjectRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReport" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sinceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorOid" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ProjectReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRequest" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentVersionId" UUID,

    CONSTRAINT "ProjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRequestVersion" (
    "id" UUID NOT NULL,
    "projectRequestId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorOid" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ProjectRequestVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRequestComment" (
    "id" UUID NOT NULL,
    "projectRequestId" UUID NOT NULL,
    "sinceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorOid" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ProjectRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentVersionId_key" ON "Project"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_projectId_version_key" ON "ProjectVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectRisk_projectId_sinceVersion_idx" ON "ProjectRisk"("projectId", "sinceVersion");

-- CreateIndex
CREATE INDEX "ProjectReport_projectId_sinceVersion_idx" ON "ProjectReport"("projectId", "sinceVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRequest_currentVersionId_key" ON "ProjectRequest"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRequestVersion_projectRequestId_version_key" ON "ProjectRequestVersion"("projectRequestId", "version");

-- CreateIndex
CREATE INDEX "ProjectRequestComment_projectRequestId_sinceVersion_idx" ON "ProjectRequestComment"("projectRequestId", "sinceVersion");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReport" ADD CONSTRAINT "ProjectReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProjectRequestVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequestVersion" ADD CONSTRAINT "ProjectRequestVersion_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "ProjectRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequestComment" ADD CONSTRAINT "ProjectRequestComment_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "ProjectRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Version and child rows are the audit trail: never changed, never deleted.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "ProjectVersion" FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "ProjectRisk" FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "ProjectReport" FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "ProjectRequestVersion" FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON "ProjectRequestComment" FOR EACH ROW EXECUTE FUNCTION forbid_change();
