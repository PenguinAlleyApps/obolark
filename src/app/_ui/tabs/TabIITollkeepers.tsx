'use client';
import styles from './TabIITollkeepers.module.css';
import CrossButton from '../CrossButton';
import type { TabIIProps } from './types';

export default function TabIITollkeepers({ endpoints, agents }: TabIIProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>[ II · ENDPOINT CATALOG · TOLLS AT THE CROSSING ]</span>
        <span>POST · requires PAYMENT-SIGNATURE</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.tollTable}>
          <thead>
            <tr>
              <th>Route</th>
              <th>Tollkeeper</th>
              <th className={styles.numeric}>Base (USDC)</th>
              <th className={styles.numeric}>Supervision</th>
              <th>Description</th>
              <th className={styles.numeric}>Cross</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => {
              const seller = agents.find((a) => a.code === e.seller);
              const codename = seller?.codename ?? e.seller;
              return (
                <tr key={e.path}>
                  <td><span className={styles.route}>{e.path}</span></td>
                  <td>
                    <span className={styles.tollkeeper}>
                      <span className={styles.statusLed} data-state="signal" />
                      <span className={styles.codename}>{codename}</span>
                      <span className={styles.code}>· {e.seller}</span>
                    </span>
                  </td>
                  <td className={styles.numeric}>{e.price}</td>
                  <td className={styles.numeric}>{e.supervisionFee}</td>
                  <td className={styles.description}>{e.description}</td>
                  <td className={styles.crossCell}>
                    <CrossButton endpoint={e.path} sellerCodename={codename} sellerCode={e.seller} price={e.price} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
