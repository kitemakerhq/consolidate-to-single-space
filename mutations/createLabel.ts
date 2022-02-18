import gql from "graphql-tag";

export const createLabelMutation = gql`
  mutation CreateLabel($space: ID!, $name: String!, $color: String) {
    createLabel(input: { spaceId: $space, name: $name, color: $color }) {
      label {
        id
        name
        color
      }
    }
  }
`;
