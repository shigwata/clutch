import React from "react";
import type { clutch as IClutch } from "@clutch-sh/api";
import {
  Button,
  ButtonGroup,
  client,
  MetadataTable,
  Tab,
  Tabs,
  TextField,
  useWizardContext,
} from "@clutch-sh/core";
import { useDataLayout } from "@clutch-sh/data-layout";
import type { WizardChild } from "@clutch-sh/wizard";
import { Wizard, WizardStep } from "@clutch-sh/wizard";
import FileSaver from "file-saver";

import type { TriageChild, WorkflowProps } from "../index";

import Clusters from "./clusters";
import Dashboard from "./dashboard";
import Listeners from "./listeners";
import Runtime from "./runtime";
import ServerInfo from "./server-info";
import Stats from "./stats";

const INCLUDE_OPTIONS = {
  clusters: true,
  configDump: true,
  listeners: true,
  runtime: true,
  stats: true,
  serverInfo: true,
};

const TriageIdentifier: React.FC<TriageChild> = ({ host = "" }) => {
  const { onSubmit } = useWizardContext();
  const resourceData = useDataLayout("resourceData");

  React.useEffect(() => {
    if (host) {
      resourceData.value.host = host;
      onSubmit();
    }
    return () => {};
  }, [host]);

  return (
    <>
      <TextField
        label="IP Address or Hostname"
        placeholder="127.0.0.1"
        onChange={e => resourceData.updateData("host", e.target.value)}
        onReturn={onSubmit}
      />
      <ButtonGroup>
        <Button text="Search" onClick={onSubmit} />
      </ButtonGroup>
    </>
  );
};

// This function is here for downloading the envoy config dump.
const download = (data, host) => {
  const output = new Blob([JSON.stringify(data, null, "\t")]);
  const timestamp = Date.now();
  FileSaver.saveAs(output, `envoy_config_dump_${host}_${timestamp}.json`);
};

const TriageDetails: React.FC<WizardChild> = () => {
  const remoteData = useDataLayout("remoteData");
  const metadata = remoteData.value.nodeMetadata as IClutch.envoytriage.v1.NodeMetadata;
  const { clusters, configDump, listeners, runtime, stats, serverInfo } =
    (remoteData.value?.output as IClutch.envoytriage.v1.Result.Output) || {};

  const failingClusterCount = clusters?.clusterStatuses.filter(
    cluster => cluster.hostStatuses.filter(host => !host.healthy).length > 0
  ).length;
  const healthyClusterCount = (clusters?.clusterStatuses || []).length - failingClusterCount;

  const data = [
    {
      id: "Running",
      value: healthyClusterCount,
      color: "#69F0AE",
    },
    {
      id: "Failing",
      value: failingClusterCount,
      color: "#FF8A80",
    },
  ];
  const dashboardFeaturedSummary = { name: "Clusters", data };
  const dashboardSummary = [
    { name: "Listeners", value: listeners?.listenerStatuses?.length || 0 },
    { name: "Runtime Keys", value: runtime?.entries?.length || 0 },
    { name: "Stats", value: stats?.stats?.length || 0 },
  ];

  return (
    <WizardStep error={remoteData.error} isLoading={remoteData.isLoading}>
      <MetadataTable
        data={[
          {
            name: "Address",
            value: `${remoteData.value.address?.host}:${remoteData.value.address?.port}`,
          },
          { name: "Service Node", value: metadata?.serviceNode },
          { name: "Service Zone", value: metadata?.serviceZone },
          { name: "Service Cluster", value: metadata?.serviceCluster },
        ]}
      />
      <Button
        text="Download Config Dump"
        onClick={() => {
          download(configDump?.value, remoteData.value.address?.host);
        }}
      />
      <Tabs>
        <Tab label="Dashboard">
          <Dashboard
            serverInfo={serverInfo}
            featuredSummary={dashboardFeaturedSummary}
            summaries={dashboardSummary}
          />
        </Tab>
        <Tab label="Clusters">
          <Clusters clusters={clusters} />
        </Tab>
        <Tab label="Listeners">
          <Listeners listeners={listeners} />
        </Tab>
        <Tab label="Runtime">
          <Runtime runtime={runtime} />
        </Tab>
        <Tab label="Stats">
          <Stats stats={stats} />
        </Tab>
        <Tab label="Server Info">
          <ServerInfo info={serverInfo} />
        </Tab>
      </Tabs>
    </WizardStep>
  );
};

const RemoteTriage: React.FC<WorkflowProps> = ({ heading }) => {
  const urlParams = new URLSearchParams(window.location.search);
  const hostParam = urlParams.get("_q");

  const dataLayout = {
    resourceData: {},
    remoteData: {
      deps: ["resourceData"],
      cache: false,
      hydrator: (resourceData: { host: string }) => {
        return client.post("/v1/envoytriage/read", {
          operations: [
            {
              address: {
                host: resourceData.host,
              },
              include: INCLUDE_OPTIONS,
            },
          ],
        } as IClutch.envoytriage.v1.ReadRequest);
      },
      transformResponse: response => response.data.results?.[0],
    },
  };

  return (
    <Wizard dataLayout={dataLayout} heading={heading}>
      <TriageIdentifier name="Lookup" host={hostParam} />
      <TriageDetails name="Details" />
    </Wizard>
  );
};

export default RemoteTriage;
