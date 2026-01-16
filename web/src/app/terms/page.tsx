import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* 返回登录 */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-900 mb-8"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回登录
        </Link>

        <div className="bg-white rounded-2xl p-8 md:p-12">
          <h1 className="text-2xl font-semibold text-neutral-900 mb-2">服务条款</h1>
          <p className="text-neutral-500 mb-8">最后更新：2025年1月</p>

          <div className="prose prose-neutral max-w-none">
            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">1. 服务说明</h2>
              <p className="text-neutral-600 leading-relaxed">
                Orbit 是一款轻量级应用数据服务平台，为开发者提供简洁的数据收集与分析功能。
                我们致力于提供稳定、安全的服务，帮助您更好地了解应用的使用情况。
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">2. 账户注册</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                使用 Orbit 服务需要注册账户。您可以通过 Google 或 GitHub 账户进行登录。
                注册时，您需确保：
              </p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>提供真实、准确的账户信息</li>
                <li>妥善保管您的账户凭证</li>
                <li>对账户下的所有活动负责</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">3. 服务使用规范</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">在使用 Orbit 服务时，您同意：</p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>遵守所有适用的法律法规</li>
                <li>不得滥用服务或干扰服务的正常运行</li>
                <li>不得收集、存储或传输任何违法或侵权内容</li>
                <li>不得尝试未经授权访问系统或数据</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">4. 数据所有权</h2>
              <p className="text-neutral-600 leading-relaxed">
                您通过 Orbit 收集的应用数据归您所有。我们仅作为数据处理方，
                为您提供数据存储和分析服务。您有权随时导出或删除您的数据。
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">5. 服务变更与终止</h2>
              <p className="text-neutral-600 leading-relaxed">
                我们保留随时修改、暂停或终止服务的权利。对于重大变更，
                我们会提前通知您。如果您违反本条款，我们有权暂停或终止您的账户。
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">6. 免责声明</h2>
              <p className="text-neutral-600 leading-relaxed">
                Orbit 服务按「现状」提供，我们不对服务的持续可用性、
                准确性或适用性作任何明示或暗示的保证。在法律允许的范围内，
                我们不对因使用服务而产生的任何直接或间接损失承担责任。
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-neutral-900 mb-4">7. 联系我们</h2>
              <p className="text-neutral-600 leading-relaxed">
                如果您对本服务条款有任何疑问，请通过我们的官方渠道联系我们。
              </p>
            </section>
          </div>
        </div>

        <p className="text-center text-sm text-neutral-400 mt-8">
          © 2025 Orbit. All rights reserved.
        </p>
      </div>
    </div>
  );
}
