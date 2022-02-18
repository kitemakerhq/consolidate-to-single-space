import gql from "graphql-tag";

export const addLabelsMutation = gql`
  mutation AddLabels($id: ID!, $labels: [ID!]!) {
    addLabelsToWorkItem(input: { id: $id, labelIds: $labels }) {
      workItem {
        id
        labels {
          id
        }
      }
    }
  }
`;
