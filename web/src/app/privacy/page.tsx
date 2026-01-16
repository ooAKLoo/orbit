import Link from 'next/link';

export default function PrivacyPage() {
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
          <h1 className="text-2xl font-semibold text-neutral-900 mb-2">隐私政策</h1>
          <p className="text-neutral-500 mb-8">最后更新：2025年1月</p>

          <div className="prose prose-neutral max-w-none">
            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">1. 概述</h2>
              <p className="text-neutral-600 leading-relaxed">
                Orbit 重视您的隐私。本隐私政策说明了我们如何收集、使用、存储和保护您的个人信息。
                使用我们的服务即表示您同意本政策中描述的数据处理方式。
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">2. 我们收集的信息</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">我们可能收集以下类型的信息：</p>

              <h3 className="text-base font-medium text-neutral-800 mb-2">账户信息</h3>
              <ul className="list-disc list-inside text-neutral-600 space-y-2 mb-4">
                <li>通过 Google 或 GitHub 登录时提供的基本资料（姓名、邮箱、头像）</li>
                <li>您创建的应用信息和配置</li>
              </ul>

              <h3 className="text-base font-medium text-neutral-800 mb-2">使用数据</h3>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>您的应用通过 SDK 上报的事件数据</li>
                <li>服务使用日志和分析数据</li>
                <li>设备信息和 IP 地址（用于安全和分析目的）</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">3. 信息使用方式</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">我们使用收集的信息用于：</p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>提供、维护和改进我们的服务</li>
                <li>处理和展示您应用的数据分析</li>
                <li>发送服务通知和更新</li>
                <li>检测和防止欺诈、滥用行为</li>
                <li>遵守法律义务</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">4. 数据存储与安全</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                我们采取合理的技术和组织措施来保护您的数据：
              </p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>数据传输使用 HTTPS 加密</li>
                <li>数据存储在安全的云服务器上</li>
                <li>定期进行安全审查和更新</li>
                <li>严格限制员工对数据的访问权限</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">5. 数据共享</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                我们不会出售您的个人信息。我们可能在以下情况下共享信息：
              </p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>经您明确同意</li>
                <li>与提供服务所需的服务提供商（如云托管）</li>
                <li>法律要求或保护权利时</li>
                <li>企业合并或收购时（会提前通知）</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">6. 您的权利</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">您对您的数据拥有以下权利：</p>
              <ul className="list-disc list-inside text-neutral-600 space-y-2">
                <li>访问和查看您的个人信息</li>
                <li>更正不准确的信息</li>
                <li>删除您的账户和数据</li>
                <li>导出您的数据</li>
                <li>撤回同意（可能影响服务使用）</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">7. Cookie 使用</h2>
              <p className="text-neutral-600 leading-relaxed">
                我们使用必要的 Cookie 来维护您的登录状态和服务功能。
                这些 Cookie 对于服务的正常运行是必需的。
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">8. 政策变更</h2>
              <p className="text-neutral-600 leading-relaxed">
                我们可能会不时更新本隐私政策。重大变更时，我们会通过邮件或服务内通知的方式告知您。
                继续使用服务即表示您接受更新后的政策。
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-neutral-900 mb-4">9. 联系我们</h2>
              <p className="text-neutral-600 leading-relaxed">
                如果您对本隐私政策有任何疑问或需要行使您的数据权利，请通过我们的官方渠道联系我们。
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
