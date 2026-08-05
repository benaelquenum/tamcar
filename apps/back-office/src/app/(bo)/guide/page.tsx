import { GUIDE_SECTIONS } from './content';
import { RichText } from './RichText';

export const metadata = {
  title: 'Guide d’utilisation — TamCar Office',
};

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl pb-3xl">
      <header>
        <h1 className="text-3xl font-extrabold text-neutral-900">
          Guide d&apos;utilisation
        </h1>
        <p className="mt-sm text-sm leading-relaxed text-neutral-600">
          TamCar Office est le bureau administratif de l&apos;entreprise : le
          courrier, les documents, les échéances à ne pas manquer, l&apos;argent
          qui sort et qui entre, et la comptabilité. Ce guide se lit une fois en
          entier, puis se consulte au besoin. Il ne suppose aucune connaissance
          en comptabilité : le logiciel fait le travail comptable, votre rôle est
          de décrire fidèlement ce qui s&apos;est passé.
        </p>
      </header>

      {/* Sommaire */}
      <nav className="mt-xl rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">
          Sommaire
        </p>
        <ol className="mt-md space-y-xs">
          {GUIDE_SECTIONS.map((s, i) => (
            <li key={s.id} className="text-sm">
              <a
                href={`#${s.id}`}
                className="text-primary-700 hover:underline"
              >
                <span className="mr-sm font-mono text-xs text-neutral-400">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {GUIDE_SECTIONS.map((section, i) => (
        <section key={section.id} id={section.id} className="mt-2xl scroll-mt-lg">
          <h2 className="border-b border-neutral-200 pb-sm text-xl font-extrabold text-neutral-900">
            <span className="mr-sm font-mono text-sm text-neutral-300">
              {String(i + 1).padStart(2, '0')}
            </span>
            {section.title}
          </h2>

          <div className="mt-lg space-y-lg">
            {section.blocks.map((block, j) => {
              if (block.type === 'p') {
                return (
                  <p
                    key={j}
                    className="text-sm leading-relaxed text-neutral-700"
                  >
                    <RichText>{block.text}</RichText>
                  </p>
                );
              }

              if (block.type === 'h3') {
                return (
                  <h3
                    key={j}
                    className="pt-md text-sm font-extrabold uppercase tracking-wider text-primary-700"
                  >
                    {block.text}
                  </h3>
                );
              }

              if (block.type === 'ul') {
                return (
                  <ul key={j} className="space-y-sm">
                    {block.items.map((item, k) => (
                      <li
                        key={k}
                        className="flex gap-md text-sm leading-relaxed text-neutral-700"
                      >
                        <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-primary-400" />
                        <span>
                          <RichText>{item}</RichText>
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === 'steps') {
                return (
                  <ol key={j} className="space-y-sm">
                    {block.items.map((item, k) => (
                      <li
                        key={k}
                        className="flex gap-md text-sm leading-relaxed text-neutral-700"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                          {k + 1}
                        </span>
                        <span className="pt-[2px]">
                          <RichText>{item}</RichText>
                        </span>
                      </li>
                    ))}
                  </ol>
                );
              }

              if (block.type === 'table') {
                return (
                  <div
                    key={j}
                    className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200"
                  >
                    <table className="w-full text-left text-sm">
                      <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                        <tr>
                          {block.head.map((h) => (
                            <th key={h} className="px-lg py-sm font-bold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {block.rows.map((row, k) => (
                          <tr key={k}>
                            {row.map((cell, l) => (
                              <td
                                key={l}
                                className={`px-lg py-md align-top leading-relaxed ${
                                  l === 0
                                    ? 'font-bold text-neutral-900'
                                    : 'text-neutral-700'
                                }`}
                              >
                                <RichText>{cell}</RichText>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              // note
              const tone =
                block.tone === 'warn'
                  ? 'bg-warning/10 ring-warning/20 text-warning'
                  : 'bg-info/5 ring-info/20 text-info';
              return (
                <div key={j} className={`rounded-xl p-lg ring-1 ${tone}`}>
                  <p className="text-sm font-extrabold">{block.title}</p>
                  <p className="mt-xs text-sm leading-relaxed text-neutral-700">
                    <RichText>{block.text}</RichText>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="mt-2xl border-t border-neutral-200 pt-lg text-xs text-neutral-400">
        Une question que ce guide ne couvre pas ? Notez-la et transmettez-la au
        fondateur : le guide sera complété.
      </p>
    </div>
  );
}
