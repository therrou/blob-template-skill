import styled from 'styled-components';

const Header = styled.header`
  padding: ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.foreground};
`;

export function PageHeader({ title }: { title: string }) {
  return (
    <Header>
      <Title>{title}</Title>
    </Header>
  );
}
