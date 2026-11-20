// One calendar file per event, for "Add to calendar". Static: generated at build time.
import { events, label } from '../../lib/data';
import { toIcs } from '../../../scripts/events.mjs';
export function getStaticPaths() {
  return events.map((e) => ({ params: { id: e.id }, props: { e } }));
}
export const GET = ({ props, site }: { props: { e: any }; site?: URL }) =>
  new Response(toIcs(props.e, { site: site?.origin || 'https://midnightchildrenrecords.com', labelName: label.name }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
