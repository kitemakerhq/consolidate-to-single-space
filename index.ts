import {
  InMemoryCache,
  IntrospectionFragmentMatcher,
} from "apollo-cache-inmemory";
import { ApolloClient } from "apollo-client";
import { setContext } from "apollo-link-context";
import { HttpLink } from "apollo-link-http";
import "cross-fetch/polyfill";
import readline from "readline";
import { addLabelsMutation } from "./mutations/addLabels";
import { createLabelMutation } from "./mutations/createLabel";
import { moveWorkItemMutation } from "./mutations/moveWorkItem";
import { spacesQuery } from "./queries/spaces";
import { workItemsQuery } from "./queries/workItems";

// import { addLabelsMutation } from './mutations/addLabels';
// import { removeLabelsMutation } from './mutations/removeLabels';
// import { workItemsQuery } from './queries/workItems';

if (!process.env.KITEMAKER_TOKEN) {
  console.error(
    "Could not find Kitemaker token. Make sure the KITEMAKER_TOKEN environment variable is set."
  );
  process.exit(-1);
}

const host = process.env.KITEMAKER_HOST ?? "https://toil.kitemaker.co";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const httpLink = new HttpLink({
  uri: `${host}/developers/graphql`,
});
const authLink = setContext((_, { headers }) => {
  return {
    headers: {
      ...headers,
      authorization: `Bearer ${process.env.KITEMAKER_TOKEN}`,
    },
  };
});

const fragmentMatcher = new IntrospectionFragmentMatcher({
  introspectionQueryResultData: { __schema: { types: [] } },
});
const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({ fragmentMatcher }),
});

/*
async function fetchWorkItems(space: string): Promise<any[]> {
  const workItems: any[] = [];
  let hasMore = true;
  let cursor: string | null = null;

  while (hasMore) {
    const result: any = await client.query({
      query: workItemsQuery,
      variables: {
        space,
        cursor,
      },
    });

    if (result.errors) {
      console.error('Unable to dump work items', JSON.stringify(result.errors, null, '  '));
      process.exit(-1);
    }

    cursor = result.data.workItems.cursor;
    hasMore = result.data.workItems.hasMore;
    for (const workItem of result.data.workItems.workItems) {
      workItems.push(workItem);
    }
  }

  return workItems;
}

async function swap() {
  try {
    const { ['replace-with']: replaceWith, ['to-replace']: toReplace, space } = opts;
    const workItems = await fetchWorkItems(space);
    for (const workItem of workItems) {
      const labels: string[] = workItem.labels.map((label: any) => label.id);
      if (!labels.includes(toReplace)) {
        continue;
      }

      // add the replacement if needed
      if (!labels.includes(replaceWith)) {
        await client.mutate({
          mutation: addLabelsMutation,
          variables: {
            id: workItem.id,
            labelIds: [replaceWith],
          },
        });
      }

      // remove the one to replace
      await client.mutate({
        mutation: removeLabelsMutation,
        variables: {
          id: workItem.id,
          labelIds: [toReplace],
        },
      });
    }
  } catch (e) {
    console.error('Swapping labels', e.message, JSON.stringify(e, null, '  '));
  }
}

swap();
*/

async function fetchWorkItems(spaceId: string): Promise<any[]> {
  const workItems: any[] = [];
  let hasMore = true;
  let cursor: string | null = null;

  while (hasMore) {
    const result: any = await client.query({
      query: workItemsQuery,
      variables: {
        space: spaceId,
        cursor,
      },
    });

    if (result.errors) {
      console.error(
        "Unable to dump work items",
        JSON.stringify(result.errors, null, "  ")
      );
      process.exit(-1);
    }

    cursor = result.data.workItems.cursor;
    hasMore = result.data.workItems.hasMore;
    for (const workItem of result.data.workItems.workItems) {
      workItems.push(workItem);
    }
  }

  return workItems;
}
async function consolidate(spacesToConsolidate: any[], space: any) {
  const labels = space.labels.reduce(
    (result: Record<string, string>, label: any) => {
      result[label.name] = label.id;
      return result;
    },
    {}
  );
  const statuses = space.statuses.reduce(
    (result: Record<string, string>, status: any) => {
      if (!result[status.type] || status.default) {
        result[status.type] = status.id;
      }
      return result;
    },
    {}
  );

  if (!statuses["BACKLOG"]) {
    statuses["BACKLOG"] = statuses["TODO"];
  }

  for (const spaceToConsolidate of spacesToConsolidate) {
    const workItems = await fetchWorkItems(spaceToConsolidate.id);
    for (const workItem of workItems) {
      const labelNames: string[] = workItem.labels.map((l: any) => l.name);
      for (const labelName of labelNames) {
        if (!labels[labelName]) {
          const newLabel = await client.mutate({
            mutation: createLabelMutation,
            variables: {
              space: space.id,
              name: labelName,
              color: workItem.labels.find((l: any) => l.name === labelName)!
                .color,
            },
          });
          labels[labelName] = newLabel.data.createLabel.label.id;
        }
      }
      const labelIds = labelNames.map((name) => labels[name]);
      const statusId = statuses[workItem.status.type];

      await client.mutate({
        mutation: moveWorkItemMutation,
        variables: {
          id: workItem.id,
          space: space.id,
          status: statusId,
        },
      });
      await client.mutate({
        mutation: addLabelsMutation,
        variables: {
          id: workItem.id,
          labels: labelIds,
        },
      });
    }
  }
}

async function run() {
  const spacesResult: any = await client.query({
    query: spacesQuery,
  });

  const spaces = spacesResult.data.organization.spaces;
  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    console.log(`[${i + 1}] ${space.name}`);
  }

  rl.question(
    "To which space do you want to move all of your work items? ",
    async (answer) => {
      const num = parseInt(answer, 10);
      const space = spaces[num - 1];
      if (!space) {
        console.log("Not a valid choice");
        process.exit(-1);
      }

      rl.question(
        `Are you sure you want to move all work items to space ${space.name}? [y/n] `,
        async (answer) => {
          rl.close();
          if (answer.toLowerCase() === "y") {
            console.log("Consolidating...");
            await consolidate(
              spaces.filter((s: any) => s.id !== space.id),
              space
            );
          }

          process.exit(0);
        }
      );
    }
  );
}

run();
