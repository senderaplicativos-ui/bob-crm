// Tela legada. O fluxo de adicionar cliente foi unificado em Conexoes
// (rota /adicionar-cliente e /conexoes?add=true). Este arquivo não faz mais
// parte do roteamento; mantido apenas como redirect para evitar imports quebrados.
import { Navigate } from "react-router-dom";

const AddClient = () => <Navigate to="/conexoes?add=true" replace />;

export default AddClient;
