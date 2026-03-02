
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings,
  LogOut,
  Home,
  Search,
  Info,
  ChevronDown,
  SlidersHorizontal,
  Bot,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";


const glossaryData = [
  
  {
    id: "compte-courant",
    terme: "Compte courant",
    categorie: "Comptes & épargne",
    resume: "Compte principal pour les dépenses du quotidien.",
    definition:
      "Le compte courant est le compte bancaire utilisé pour recevoir les revenus (salaire, aides, etc.) et régler les dépenses de tous les jours : paiements par carte, virements, prélèvements.",
    avantages: [
      "Argent disponible immédiatement.",
      "Indispensable pour la vie quotidienne (loyer, abonnements, etc.).",
      "Facilite les paiements et virements.",
    ],
    inconvenients: [
      "Ne rapporte quasiment pas d'intérêts.",
      "Peu adapté pour de l'épargne à moyen ou long terme.",
    ],
    profils:
      "Tout le monde : étudiants, salariés, indépendants… C’est la base de la gestion bancaire.",
    situations:
      "Idéal pour gérer les dépenses courantes, payer ses factures, recevoir son salaire.",
  },
  {
    id: "compte-joint",
    terme: "Compte joint",
    categorie: "Comptes & épargne",
    resume: "Compte partagé à plusieurs pour gérer des dépenses communes.",
    definition:
      "Le compte joint est un compte bancaire détenu par au moins deux personnes, qui peuvent toutes effectuer des opérations dessus.",
    avantages: [
      "Simplifie la gestion des dépenses partagées (loyer, courses, factures).",
      "Permet une vision commune des mouvements d'argent.",
    ],
    inconvenients: [
      "Tous les co-titulaires sont responsables des opérations réalisées.",
      "En cas de conflit, la gestion du compte peut devenir compliquée.",
    ],
    profils: "Couples, colocataires, membres d’une même famille.",
    situations:
      "Idéal pour centraliser les dépenses d’un foyer ou d’une colocation sur un même compte.",
  },
  {
    id: "livret-a",
    terme: "Livret A",
    categorie: "Comptes & épargne",
    resume: "Épargne sécurisée, disponible et défiscalisée.",
    definition:
      "Le Livret A est un livret d'épargne réglementé dont le taux est fixé par l'État. Il est sans risque et les intérêts sont exonérés d'impôt et de prélèvements sociaux.",
    avantages: [
      "Aucun risque de perte en capital.",
      "Intérêts non imposés.",
      "Argent disponible à tout moment.",
    ],
    inconvenients: [
      "Plafond limité.",
      "Taux parfois inférieur à l'inflation, donc perte de pouvoir d'achat.",
    ],
    profils:
      "Personnes qui veulent une épargne de précaution simple, sans risque et disponible.",
    situations:
      "Idéal pour constituer un matelas de sécurité (imprévu, dépenses urgentes).",
  },
  {
    id: "ldds",
    terme: "LDDS (Livret de Développement Durable et Solidaire)",
    categorie: "Comptes & épargne",
    resume: "Livret défiscalisé complémentaire au Livret A.",
    definition:
      "Le LDDS est un livret d'épargne réglementé, très proche du Livret A, avec le même taux la plupart du temps. Il est également défiscalisé et sans risque.",
    avantages: [
      "Sans risque et défiscalisé.",
      "Complément idéal du Livret A une fois celui-ci plein.",
    ],
    inconvenients: [
      "Plafond plus faible que le Livret A.",
      "Même problème de rendement potentiellement inférieur à l'inflation.",
    ],
    profils:
      "Personnes ayant déjà rempli leur Livret A et souhaitant continuer à épargner sans risque.",
    situations:
      "À utiliser une fois le Livret A plafonné, pour compléter l'épargne de précaution.",
  },
  {
    id: "lep",
    terme: "LEP (Livret d'Épargne Populaire)",
    categorie: "Comptes & épargne",
    resume: "Livret mieux rémunéré, réservé aux revenus modestes.",
    definition:
      "Le LEP est un livret réglementé réservé aux personnes ayant des revenus modestes. Il offre un taux d'intérêt plus élevé que le Livret A, sans risque et défiscalisé.",
    avantages: [
      "Meilleur taux que la plupart des autres livrets sécurisés.",
      "Intérêts non imposés.",
      "Aucun risque de perte en capital.",
    ],
    inconvenients: [
      "Accessible uniquement sous conditions de revenus.",
      "Plafond limité.",
    ],
    profils:
      "Personnes éligibles (revenus modestes) souhaitant optimiser leur épargne sécurisée.",
    situations:
      "Prioritaire si tu es éligible : c’est souvent le meilleur placement court terme sans risque.",
  },
  {
    id: "livret-jeune",
    terme: "Livret Jeune",
    categorie: "Comptes & épargne",
    resume: "Livret réservé aux 12–25 ans, avec bon taux.",
    definition:
      "Le Livret Jeune est un livret d'épargne réglementé, réservé aux jeunes de 12 à 25 ans, avec un taux souvent supérieur au Livret A.",
    avantages: [
      "Taux généralement plus intéressant que le Livret A.",
      "Intérêts défiscalisés.",
      "Permet d’apprendre à gérer son épargne tôt.",
    ],
    inconvenients: [
      "Réservé à une tranche d’âge limitée.",
      "Plafond relativement faible.",
    ],
    profils: "Jeunes de 12 à 25 ans.",
    situations:
      "Idéal pour démarrer l’épargne pendant les études ou les premiers jobs.",
  },
  {
    id: "livret-bancaire",
    terme: "Livret bancaire non réglementé",
    categorie: "Comptes & épargne",
    resume: "Livret dont le taux est fixé librement par la banque.",
    definition:
      "C’est un livret d’épargne proposé par une banque, avec un taux fixé contractuellement, soumis à l’impôt et aux prélèvements sociaux.",
    avantages: [
      "Plafonds souvent plus élevés que les livrets réglementés.",
      "Peut proposer des promotions à l’ouverture (taux boosté temporaire).",
    ],
    inconvenients: [
      "Intérêts imposables.",
      "Le taux peut être peu attractif une fois la période promotionnelle terminée.",
    ],
    profils: "Personnes ayant déjà maximisé leurs livrets réglementés.",
    situations:
      "Intéressant pour placer un surplus de trésorerie une fois Livret A / LDDS / LEP remplis.",
  },
  {
    id: "pel",
    terme: "PEL (Plan d'Épargne Logement)",
    categorie: "Comptes & épargne",
    resume: "Épargne bloquée liée à un projet immobilier.",
    definition:
      "Le PEL est un produit d'épargne réglementé destiné à financer un futur projet immobilier. L'argent est bloqué et le taux est connu dès l'ouverture.",
    avantages: [
      "Taux garanti pendant toute la durée du plan.",
      "Peut donner droit à un prêt immobilier à taux privilégié.",
      "Plafond plus élevé qu'un livret classique.",
    ],
    inconvenients: [
      "Argent partiellement bloqué (retraits strictement encadrés).",
      "Moins flexible qu'un livret classique.",
      "Taux parfois peu attractif sur les nouveaux PEL.",
    ],
    profils:
      "Personnes qui préparent un projet immobilier à moyen/long terme.",
    situations:
      "Intéressant si tu envisages un achat et veux sécuriser une partie de ton taux futur.",
  },
  {
    id: "cel",
    terme: "CEL (Compte Épargne Logement)",
    categorie: "Comptes & épargne",
    resume: "Épargne logement plus flexible que le PEL.",
    definition:
      "Le CEL est un produit d’épargne logement plus souple que le PEL : les retraits sont possibles sans clôture, mais les montants et taux sont plus limités.",
    avantages: [
      "Retraits possibles sans fermer le compte.",
      "Permet aussi d’accéder à un prêt immobilier aidé.",
    ],
    inconvenients: [
      "Taux souvent faible.",
      "Moins intéressant si on n’utilise pas le prêt associé.",
    ],
    profils:
      "Personnes qui envisagent un projet immobilier mais veulent garder de la flexibilité.",
    situations:
      "À privilégier si tu veux garder ton argent disponible tout en préparant un possible projet immobilier.",
  },
  {
    id: "compte-a-terme",
    terme: "Compte à terme",
    categorie: "Comptes & épargne",
    resume: "Épargne bloquée pour une durée fixe, avec taux garanti.",
    definition:
      "Le compte à terme est un placement où l'argent est bloqué pour une durée définie en échange d'un taux fixe garanti à l'avance.",
    avantages: [
      "Taux connu dès le départ.",
      "Placement sans risque (dans les limites de garantie bancaire).",
    ],
    inconvenients: [
      "Argent indisponible pendant la durée prévue.",
      "Pénalités en cas de retrait anticipé.",
    ],
    profils:
      "Personnes disposant d'une somme qu'elles n'ont pas besoin d'utiliser à court terme.",
    situations:
      "À utiliser pour immobiliser une somme pendant 6 mois, 1 an ou plus, en échange d’un taux garanti.",
  },

  
  {
    id: "pea",
    terme: "PEA (Plan d'Épargne en Actions)",
    categorie: "Comptes d'investissement",
    resume: "Compte d'actions européennes avec avantage fiscal après 5 ans.",
    definition:
      "Le PEA est un compte permettant d'investir en actions et ETF principalement européens. Après un certain délai de détention, les gains bénéficient d'un cadre fiscal avantageux.",
    avantages: [
      "Fiscalité très intéressante à long terme.",
      "Permet d'investir facilement en actions et ETF.",
      "Outil central pour un portefeuille boursier long terme.",
    ],
    inconvenients: [
      "Limité aux titres éligibles (principalement Europe).",
      "Plafond de versements.",
      "Retraits avant certaines dates peuvent réduire l'avantage fiscal.",
    ],
    profils:
      "Investisseurs prêts à immobiliser leur épargne plusieurs années pour profiter de la fiscalité.",
    situations:
      "Très adapté pour une stratégie de versements réguliers sur des ETF/indices européens.",
  },
  {
    id: "pea-pme",
    terme: "PEA-PME",
    categorie: "Comptes d'investissement",
    resume: "Variante du PEA dédiée aux petites et moyennes entreprises.",
    definition:
      "Le PEA-PME fonctionne comme un PEA, mais il est dédié à l’investissement dans des petites et moyennes entreprises et ETI.",
    avantages: [
      "Même logique fiscale favorable que le PEA.",
      "Permet de soutenir l’économie locale et les plus petites entreprises.",
    ],
    inconvenients: [
      "Risque plus élevé (PME plus sensibles aux crises).",
      "Moins de choix de produits faciles (ETF, etc.).",
    ],
    profils:
      "Investisseurs déjà à l’aise avec la bourse et souhaitant diversifier sur des entreprises plus petites.",
    situations:
      "À utiliser en complément d’un PEA classique, pas comme unique support.",
  },
  {
    id: "cto",
    terme: "Compte-titres ordinaire (CTO)",
    categorie: "Comptes d'investissement",
    resume: "Compte d'investissement sans limite géographique.",
    definition:
      "Le compte-titres ordinaire permet d'investir dans quasiment tous les types de titres : actions, obligations, ETF du monde entier, fonds, etc.",
    avantages: [
      "Aucune limite géographique : USA, Asie, monde entier.",
      "Aucun plafond de versement.",
      "Compatible avec de nombreux produits financiers (y compris exotiques).",
    ],
    inconvenients: [
      "Fiscalité classique (PFU / barème) sur les gains.",
      "Pas d’avantage fiscal spécifique.",
    ],
    profils:
      "Investisseurs souhaitant une grande liberté de choix (notamment les marchés étrangers).",
    situations:
      "Idéal pour acheter des actions américaines, des ETF mondiaux, des secteurs très spécifiques.",
  },
  {
    id: "assurance-vie",
    terme: "Assurance-vie",
    categorie: "Comptes d'investissement",
    resume:
      "Contrat d’épargne long terme très flexible, avec options de placement.",
    definition:
      "L'assurance-vie est un contrat d'épargne permettant d'investir sur le long terme via un fonds en euros (capital garanti) et/ou des unités de compte (actions, fonds, immobilier, etc.).",
    avantages: [
      "Cadre fiscal avantageux à long terme.",
      "Très modulable (possibilité de changer l’allocation entre les supports).",
      "Outil clé pour la transmission patrimoniale.",
    ],
    inconvenients: [
      "Frais parfois élevés selon les contrats.",
      "Pas de garantie du capital en unités de compte.",
    ],
    profils:
      "Personnes souhaitant investir à long terme avec une grande souplesse et préparer des projets futurs.",
    situations:
      "Idéal pour se constituer un capital sur plusieurs années (complément de retraite, projet important, transmission).",
  },
  {
    id: "per",
    terme: "PER (Plan d'Épargne Retraite)",
    categorie: "Comptes d'investissement",
    resume:
      "Épargne spécifiquement dédiée à la retraite, avec avantage fiscal.",
    definition:
      "Le PER est un produit d'épargne dont l'objectif est de préparer la retraite. Les versements peuvent être déduits du revenu imposable dans certains cas.",
    avantages: [
      "Réduction d’impôts possible sur les versements.",
      "Placement long terme structuré pour la retraite.",
      "Large choix de supports d’investissement.",
    ],
    inconvenients: [
      "Argent généralement bloqué jusqu'à la retraite (sauf cas particuliers).",
      "Fiscalité spécifique à la sortie, parfois complexe.",
    ],
    profils:
      "Personnes imposées qui souhaitent réduire leur impôt tout en préparant leur retraite.",
    situations:
      "Pertinent si tu as un bon revenu imposable et un horizon de placement très long.",
  },
  {
    id: "wallet-crypto",
    terme: "Wallet crypto",
    categorie: "Comptes d'investissement",
    resume: "Portefeuille dédié aux crypto-monnaies.",
    definition:
      "Un wallet (portefeuille) crypto permet de stocker, envoyer et recevoir des crypto-monnaies. Il peut être custodial (géré par une plateforme) ou non custodial (tu gères toi-même les clés).",
    avantages: [
      "Accès direct aux crypto-monnaies.",
      "Possibilité de conserver soi-même ses actifs (non custodial).",
    ],
    inconvenients: [
      "Risque de perte de clés privées.",
      "Marché extrêmement volatil.",
      "Sécurité à gérer soi-même en non custodial.",
    ],
    profils:
      "Investisseurs avertis intéressés par les crypto-monnaies et prêts à gérer le risque.",
    situations:
      "À utiliser si tu veux une exposition directe aux crypto-actifs (Bitcoin, Ethereum, etc.).",
  },

  
  {
    id: "action",
    terme: "Action",
    categorie: "Produits financiers",
    resume: "Part de propriété d'une entreprise cotée.",
    definition:
      "Une action représente une fraction du capital d'une entreprise. En détenant une action, tu participes à la réussite (ou non) de l’entreprise et peux toucher des dividendes.",
    avantages: [
      "Potentiel de performance élevé à long terme.",
      "Possibilité de toucher des dividendes.",
      "Permet d’investir dans des entreprises concrètes.",
    ],
    inconvenients: [
      "Risque de perte en capital.",
      "Cours parfois très volatils.",
      "Nécessite un minimum de suivi et de tolérance au risque.",
    ],
    profils:
      "Investisseurs cherchant de la performance et acceptant les fluctuations.",
    situations:
      "Intéressant pour un portefeuille de long terme, surtout si tu choisis des entreprises solides ou via des ETF.",
  },
  {
    id: "obligation",
    terme: "Obligation",
    categorie: "Produits financiers",
    resume: "Titre de dette émis par un État ou une entreprise.",
    definition:
      "Une obligation est un titre par lequel un État ou une entreprise emprunte de l'argent à des investisseurs, en échange d'intérêts (coupons) et du remboursement du capital à l'échéance.",
    avantages: [
      "Revenus plus stables (coupons).",
      "Moins volatile que les actions, en moyenne.",
      "Permet de diversifier un portefeuille.",
    ],
    inconvenients: [
      "Risque de défaut de l'émetteur.",
      "Sensibilité aux variations de taux d'intérêt.",
      "Performance souvent plus faible que les actions à long terme.",
    ],
    profils:
      "Investisseurs souhaitant limiter le risque global ou obtenir des revenus réguliers.",
    situations:
      "Utile pour équilibrer un portefeuille trop exposé aux actions.",
  },
  {
    id: "etf",
    terme: "ETF (Exchange Traded Fund)",
    categorie: "Produits financiers",
    resume: "Fonds coté qui réplique un indice boursier.",
    definition:
      "Un ETF est un fonds coté en bourse qui vise à reproduire la performance d'un indice (comme le CAC 40 ou le MSCI World) en détenant un panier de titres.",
    avantages: [
      "Diversification automatique avec un seul produit.",
      "Frais généralement faibles.",
      "Adapté aux débutants comme aux investisseurs avancés.",
    ],
    inconvenients: [
      "Risque de marché (si l'indice baisse, l’ETF baisse aussi).",
      "Certains ETF peuvent être complexes (leviers, secteurs très nichés).",
    ],
    profils:
      "Investisseurs qui veulent une solution simple et diversifiée pour le long terme.",
    situations:
      "Parfait pour une stratégie passive de type 'buy & hold' sur des indices larges (monde, Europe, etc.).",
  },
  {
    id: "fonds-opcvm",
    terme: "Fonds (OPCVM, SICAV, FCP)",
    categorie: "Produits financiers",
    resume:
      "Fonds géré par des professionnels, qui investit dans un panier d’actifs.",
    definition:
      "Les fonds (OPCVM, SICAV, FCP) rassemblent l'argent de nombreux investisseurs pour acheter un portefeuille d’actions, d’obligations ou d’autres actifs, géré par une société de gestion.",
    avantages: [
      "Gestion déléguée à des professionnels.",
      "Diversification immédiate.",
      "Accessible même avec de petites mises.",
    ],
    inconvenients: [
      "Frais de gestion souvent plus élevés que les ETF.",
      "Performance variable selon la qualité de la gestion.",
    ],
    profils:
      "Investisseurs préférant déléguer la sélection des titres à des gérants.",
    situations:
      "Intéressant via assurance-vie ou PEA pour diversifier facilement.",
  },
  {
    id: "fonds-euros",
    terme: "Fonds en euros",
    categorie: "Produits financiers",
    resume: "Support sécurisé dans une assurance-vie, capital garanti.",
    definition:
      "Le fonds en euros est un support d'assurance-vie qui garantit le capital investi (hors frais) et verse un rendement annuel, issu principalement d’obligations et d’actifs peu risqués.",
    avantages: [
      "Capital garanti par l’assureur.",
      "Rendement généralement positif chaque année.",
      "Pas de gestion active pour l’investisseur.",
    ],
    inconvenients: [
      "Rendement en baisse depuis plusieurs années.",
      "Moins performant que les unités de compte sur le long terme.",
    ],
    profils:
      "Investisseurs prudents ou souhaitant sécuriser une partie de leur capital.",
    situations:
      "Parfait pour la poche sécurisée d’une assurance-vie ou en phase proche d’un projet.",
  },
  {
    id: "unites-de-compte",
    terme: "Unités de compte",
    categorie: "Produits financiers",
    resume: "Supports risqués d’assurance-vie (fonds, actions, immobilier…).",
    definition:
      "Les unités de compte sont les supports non garantis d’un contrat d’assurance-vie : fonds actions, obligations, immobiliers, etc. La valeur peut monter comme baisser.",
    avantages: [
      "Potentiel de performance plus élevé que le fonds en euros.",
      "Large choix de thèmes et de zones géographiques.",
      "Permet de dynamiser une assurance-vie.",
    ],
    inconvenients: [
      "Aucun capital garanti.",
      "Rendement non garanti et volatil.",
    ],
    profils:
      "Investisseurs ayant un horizon long terme et acceptant les fluctuations.",
    situations:
      "Utile pour la partie dynamique d’une assurance-vie ou d’un PER.",
  },
  {
    id: "scpi",
    terme: "SCPI (Société Civile de Placement Immobilier)",
    categorie: "Produits financiers",
    resume:
      "Immobilier indirect : tu détiens des parts, pas les murs directement.",
    definition:
      "Les SCPI sont des sociétés qui achètent et gèrent des biens immobiliers (bureaux, commerces, logements) et reversent aux investisseurs une partie des loyers, sous forme de revenus.",
    avantages: [
      "Permet d’investir dans l’immobilier sans gérer directement les biens.",
      "Revenus potentiels réguliers.",
      "Diversification géographique et sectorielle.",
    ],
    inconvenients: [
      "Capital non garanti.",
      "Liquidité limitée (revente des parts parfois lente).",
      "Frais d’entrée et de gestion importants.",
    ],
    profils:
      "Investisseurs qui veulent de l’immobilier de rendement sans gérer eux-mêmes les locataires.",
    situations:
      "Intéressant comme complément à un portefeuille diversifié, souvent via assurance-vie.",
  },
  {
    id: "matiere-premiere",
    terme: "Matières premières",
    categorie: "Produits financiers",
    resume:
      "Or, pétrole, métaux, agriculture… via ETF ou produits dérivés.",
    definition:
      "Les matières premières regroupent des actifs comme l’or, le pétrole, les métaux industriels ou les produits agricoles. On y accède généralement via ETF ou produits structurés.",
    avantages: [
      "Diversification par rapport aux actions et obligations.",
      "Certaines (comme l’or) sont parfois vues comme des valeurs refuges.",
    ],
    inconvenients: [
      "Peu de rendement intrinsèque (pas de dividendes).",
      "Très dépendant de l’offre et de la demande mondiale.",
      "Peut être très volatile.",
    ],
    profils:
      "Investisseurs souhaitant diversifier leur portefeuille avec une petite poche matières premières.",
    situations:
      "Utilisé en petite proportion pour diversifier ou se couvrir contre certains risques (inflation, crises).",
  },
  {
    id: "crypto-monnaie",
    terme: "Crypto-monnaie",
    categorie: "Produits financiers",
    resume:
      "Actif numérique basé sur une blockchain (Bitcoin, Ethereum…).",
    definition:
      "Une crypto-monnaie est une monnaie numérique décentralisée, reposant sur une blockchain. Les transactions sont vérifiées par un réseau d’ordinateurs.",
    avantages: [
      "Potentiel de performance très élevé.",
      "Marché ouvert 24h/24, 7j/7.",
      "Innovations régulières (DeFi, NFT, etc.).",
    ],
    inconvenients: [
      "Volatilité extrême.",
      "Régulation encore incertaine sur certains points.",
      "Risque de perte lié aux plateformes ou à la gestion des clés.",
    ],
    profils:
      "Investisseurs très avertis, capables d’accepter de fortes variations de valeur.",
    situations:
      "À utiliser uniquement avec une petite part du patrimoine, et en ayant bien compris les risques.",
  },
  {
    id: "stablecoin",
    terme: "Stablecoin",
    categorie: "Produits financiers",
    resume:
      "Crypto-monnaie indexée sur une autre valeur (souvent le dollar).",
    definition:
      "Les stablecoins sont des crypto-monnaies conçues pour conserver une valeur stable, souvent indexée sur une devise (1 token ≈ 1 dollar par exemple).",
    avantages: [
      "Moins volatiles que les crypto classiques.",
      "Utile pour se déplacer dans l’écosystème crypto sans repasser par la monnaie classique.",
    ],
    inconvenients: [
      "Risque lié à l’émetteur (réserves, régulation).",
      "Certains stablecoins ont déjà perdu leur ancrage par le passé.",
    ],
    profils: "Utilisateurs déjà dans l’écosystème crypto.",
    situations:
      "Intéressant pour parquer temporairement des gains ou se protéger d’un mouvement court terme dans la crypto.",
  },

  
  {
    id: "patrimoine-total",
    terme: "Patrimoine total",
    categorie: "Indicateurs & notions",
    resume: "Valeur totale de tous tes comptes et placements.",
    definition:
      "Le patrimoine total correspond à la somme de la valeur de tous les comptes et placements suivis dans Olympe (comptes bancaires, PEA, CTO, assurance-vie, crypto, etc.).",
    avantages: [
      "Permet de visualiser ta situation globale en un coup d'œil.",
      "Aide à suivre l'évolution dans le temps.",
    ],
    inconvenients: [
      "Peut masquer certains détails (un compte très risqué peut être noyé dans la somme globale).",
    ],
    profils: "Utile pour tous les utilisateurs.",
    situations:
      "Idéal pour suivre la progression de ton patrimoine mois après mois.",
  },
  {
    id: "valeur-actuelle",
    terme: "Valeur actuelle",
    categorie: "Indicateurs & notions",
    resume: "Valeur d’un placement à l’instant T.",
    definition:
      "La valeur actuelle est la valeur d’un placement au moment où tu le consultes, en fonction des cours de marché ou du solde à jour.",
    avantages: [
      "Permet de savoir combien vaut réellement ton placement maintenant.",
      "Utile pour prendre des décisions (renforcer, conserver, alléger).",
    ],
    inconvenients: [
      "Peut inciter à trop regarder les variations de court terme et à paniquer.",
    ],
    profils: "Tous les investisseurs.",
    situations:
      "À utiliser pour suivre tes placements au jour le jour, sans en faire une obsession.",
  },
  {
    id: "valeur-initiale",
    terme: "Valeur initiale",
    categorie: "Indicateurs & notions",
    resume: "Ce que tu as investi au départ.",
    definition:
      "La valeur initiale correspond au montant investi au moment de l’achat ou du premier versement sur un placement.",
    avantages: [
      "Permet de comparer ce que tu as mis au départ avec ce que tu as aujourd’hui.",
      "Base de calcul des plus-values et performances.",
    ],
    inconvenients: [
      "Ne prend pas toujours en compte les éventuels coûts ou versements successifs si mal suivie.",
    ],
    profils:
      "Investisseurs qui veulent suivre leur performance de façon claire.",
    situations:
      "Utile pour voir si un placement a été globalement une bonne ou une mauvaise opération.",
  },
  {
    id: "plus-moins-value",
    terme: "Plus-value / Moins-value",
    categorie: "Indicateurs & notions",
    resume: "Gain ou perte réalisé(e) ou latent(e) sur un placement.",
    definition:
      "La plus-value est le gain lorsque la valeur actuelle est supérieure à la valeur d’achat. La moins-value est la perte lorsque la valeur actuelle est inférieure à la valeur d’achat.",
    avantages: [
      "Indicateur direct du résultat d’un investissement.",
      "Permet de savoir si un investissement est gagnant ou perdant.",
    ],
    inconvenients: [
      "Focaliser uniquement sur le court terme peut pousser à de mauvaises décisions.",
      "Ne prend pas toujours en compte les dividendes ou intérêts si on ne les réintègre pas.",
    ],
    profils: "Tous les investisseurs.",
    situations:
      "Utile pour décider de conserver, renforcer ou alléger une position selon ta stratégie.",
  },
  {
    id: "pru",
    terme: "PRU (Prix de Revient Unitaire)",
    categorie: "Indicateurs & notions",
    resume: "Prix d'achat moyen par titre d'un placement.",
    definition:
      "Le PRU est le prix moyen auquel tu as acheté un titre, en tenant compte de tous les achats (et parfois des frais). Il sert de référence pour calculer ton gain ou ta perte.",
    avantages: [
      "Permet de savoir à partir de quel prix tu es en gain.",
      "Indispensable pour suivre correctement un investissement avec plusieurs achats.",
    ],
    inconvenients: [
      "Si mal calculé, il peut donner une impression faussée de la performance.",
    ],
    profils:
      "Tous ceux qui investissent en actions, ETF, cryptos… via plusieurs achats.",
    situations:
      "Très utile quand tu renforces une position à différents moments (DCA, achats progressifs).",
  },
  {
    id: "performance",
    terme: "Performance",
    categorie: "Indicateurs & notions",
    resume: "Variation de la valeur d’un placement sur une période.",
    definition:
      "La performance mesure l'évolution d'un placement sur une période donnée, en pourcentage. Elle compare la valeur actuelle à la valeur initiale (ou à une valeur de référence).",
    avantages: [
      "Permet de comparer différents placements entre eux.",
      "Aide à voir si tu atteins tes objectifs.",
    ],
    inconvenients: [
      "Peut être trompeuse sur de très courtes périodes.",
      "Ne suffit pas sans tenir compte du risque pris.",
    ],
    profils: "Investisseurs souhaitant piloter leur portefeuille.",
    situations:
      "Utile pour analyser quels placements fonctionnent bien ou moins bien.",
  },
  {
    id: "rendement",
    terme: "Rendement",
    categorie: "Indicateurs & notions",
    resume:
      "Revenu généré par un placement (intérêts, dividendes…).",
    definition:
      "Le rendement mesure le revenu généré par un placement (intérêts, dividendes, loyers, etc.) rapporté au capital investi, sur une période donnée.",
    avantages: [
      "Utile pour juger l’attrait d’un placement de revenu (obligations, SCPI, etc.).",
      "Permet de construire une stratégie orientée revenus.",
    ],
    inconvenients: [
      "Un rendement très élevé peut cacher un risque important.",
      "Ne prend pas en compte l’évolution du prix de l’actif (plus-values ou moins-values).",
    ],
    profils:
      "Investisseurs qui veulent générer des revenus réguliers (complément de revenu, retraite…).",
    situations:
      "Particulièrement utile pour comparer des placements de type obligations, SCPI, actions à dividendes.",
  },
  {
    id: "volatilite",
    terme: "Volatilité",
    categorie: "Indicateurs & notions",
    resume: "Amplitude des variations d’un actif.",
    definition:
      "La volatilité mesure l’ampleur et la fréquence des variations du prix d’un actif. Plus la volatilité est élevée, plus le prix bouge fortement et rapidement.",
    avantages: [
      "Peut offrir des opportunités pour les investisseurs très actifs.",
      "Indique qu’un actif peut offrir de forts mouvements (à la hausse comme à la baisse).",
    ],
    inconvenients: [
      "Peut être stressante pour les investisseurs.",
      "Augmente le risque de pertes importantes sur le court terme.",
    ],
    profils:
      "Investisseurs conscients du risque et capables de supporter des fluctuations.",
    situations:
      "À considérer avant d’acheter un actif très spéculatif (certaines actions, cryptos…).",
  },
  {
    id: "capitalisation-boursiere",
    terme: "Capitalisation boursière",
    categorie: "Indicateurs & notions",
    resume: "Valeur totale d’une entreprise en bourse.",
    definition:
      "La capitalisation boursière correspond à la valeur totale d’une entreprise cotée = nombre d’actions en circulation × prix d’une action.",
    avantages: [
      "Permet de classer les entreprises (small cap, mid cap, large cap).",
      "Donne une idée de la taille de l’entreprise sur le marché.",
    ],
    inconvenients: [
      "Ne reflète pas forcément la valeur réelle (fondamentaux) de l’entreprise.",
      "Peut être fortement influencée par la spéculation.",
    ],
    profils: "Investisseurs souhaitant comparer la taille des sociétés.",
    situations:
      "Utile pour ajuster ton exposition entre grandes entreprises stables et petites entreprises plus risquées.",
  },
  {
    id: "indice-boursier",
    terme: "Indice boursier",
    categorie: "Indicateurs & notions",
    resume:
      "Panier d’actions représentatif d’un marché (ex : CAC 40).",
    definition:
      "Un indice boursier regroupe un certain nombre d’actions sélectionnées pour représenter un marché (par pays, par secteur, par taille…).",
    avantages: [
      "Permet de suivre facilement la tendance d’un marché global.",
      "Sert de référence (benchmark) pour comparer la performance d’un portefeuille.",
    ],
    inconvenients: [
      "Ne couvre pas toute la diversité des actions existantes.",
      "Sa construction (pondération, composition) peut influencer les performances.",
    ],
    profils:
      "Investisseurs utilisant des ETF ou voulant comparer leurs résultats à un marché.",
    situations:
      "Très important pour juger si ton portefeuille fait mieux ou moins bien qu’un indice de référence.",
  },
  {
    id: "allocation-actifs",
    terme: "Allocation d’actifs",
    categorie: "Indicateurs & notions",
    resume:
      "Répartition de ton portefeuille entre plusieurs classes d’actifs.",
    definition:
      "L’allocation d’actifs désigne la manière dont ton portefeuille est réparti entre différentes catégories : actions, obligations, liquidités, immobilier, etc.",
    avantages: [
      "Permet d’adapter le niveau de risque à ton profil.",
      "Aide à diversifier pour lisser les performances.",
    ],
    inconvenients: [
      "Une mauvaise allocation peut soit créer trop de risque, soit brider les rendements.",
      "Nécessite d’être revue régulièrement.",
    ],
    profils:
      "Tous les investisseurs, car c’est la base de la construction d’un portefeuille.",
    situations:
      "Utile dès que tu as plusieurs types de placements : cela permet de voir si l’équilibre te correspond.",
  },
  {
    id: "diversification",
    terme: "Diversification",
    categorie: "Indicateurs & notions",
    resume: "Ne pas mettre tous ses œufs dans le même panier.",
    definition:
      "La diversification consiste à répartir ses investissements sur plusieurs actifs, secteurs et zones géographiques pour réduire le risque global.",
    avantages: [
      "Réduit l’impact d’un échec isolé sur le portefeuille.",
      "Peut rendre la performance plus régulière dans le temps.",
    ],
    inconvenients: [
      "Trop diversifier peut diluer les gains potentiels.",
      "Demande un minimum de suivi pour garder une cohérence.",
    ],
    profils:
      "Tous les investisseurs, surtout les débutants qui veulent limiter le risque d’erreurs.",
    situations:
      "À appliquer dès que tu commences à avoir plusieurs lignes dans ton portefeuille.",
  },
  {
    id: "horizon-placement",
    terme: "Horizon de placement",
    categorie: "Indicateurs & notions",
    resume: "Durée pendant laquelle tu comptes laisser l’argent investi.",
    definition:
      "L’horizon de placement est la durée pendant laquelle tu acceptes de garder un investissement avant d’avoir besoin de l’argent.",
    avantages: [
      "Aide à choisir des placements adaptés (court, moyen, long terme).",
      "Permet de savoir quel niveau de risque est acceptable.",
    ],
    inconvenients: [
      "Si ton horizon change (imprévu), certains placements peuvent devenir inadaptés.",
    ],
    profils: "Tous les investisseurs.",
    situations:
      "À définir avant de choisir un support : par exemple, actions pour le long terme, livret pour le très court terme.",
  },
  {
    id: "liquidites",
    terme: "Liquidités",
    categorie: "Indicateurs & notions",
    resume:
      "Argent immédiatement disponible (espèces, compte courant, livret…).",
    definition:
      "Les liquidités désignent l’argent disponible rapidement sans perte de valeur (compte courant, livrets d’épargne, etc.).",
    avantages: [
      "Permet de faire face aux imprévus.",
      "Évite de devoir vendre des placements au mauvais moment.",
    ],
    inconvenients: [
      "Peu ou pas de rendement.",
      "Trop de liquidités peut freiner la croissance du patrimoine.",
    ],
    profils:
      "Tout le monde, mais particulièrement important pour les personnes avec des revenus instables.",
    situations:
      "À constituer en épargne de précaution (3 à 6 mois de dépenses, par exemple).",
  },

  
  {
    id: "risque",
    terme: "Risque",
    categorie: "Gestion du risque",
    resume:
      "Possibilité que le résultat soit différent de ce qui est attendu (souvent à la baisse).",
    definition:
      "Le risque en finance correspond à l’incertitude sur le résultat d’un investissement : la valeur peut évoluer différemment de ce qui était prévu, y compris à la baisse.",
    avantages: [
      "Accepter un certain risque permet souvent d’espérer plus de rendement.",
      "Utile pour trouver un équilibre entre sécurité et performance.",
    ],
    inconvenients: [
      "Peut conduire à des pertes en capital.",
      "Mal géré, il peut provoquer du stress et des décisions impulsives.",
    ],
    profils:
      "Tous les investisseurs, chacun avec un niveau de tolérance différent.",
    situations:
      "À évaluer pour chaque placement et pour le portefeuille global, afin qu’il soit cohérent avec ta situation et ton caractère.",
  },
  {
    id: "profil-risque",
    terme: "Profil de risque",
    categorie: "Gestion du risque",
    resume:
      "Ton niveau de tolérance au risque (prudent, équilibré, dynamique…).",
    definition:
      "Le profil de risque décrit ta capacité et ta volonté d’accepter les fluctuations de ton portefeuille, en lien avec ta situation personnelle et tes objectifs.",
    avantages: [
      "Permet de choisir des placements en accord avec ta psychologie et ta situation.",
      "Limite les décisions basées uniquement sur l’émotion.",
    ],
    inconvenients: [
      "Un profil trop prudent peut réduire tes chances d’atteindre certains objectifs.",
      "Un profil trop agressif peut te faire paniquer en cas de baisse.",
    ],
    profils:
      "Chaque investisseur a son propre profil (prudent, équilibré, dynamique).",
    situations:
      "À définir avant d’investir de manière significative, pour construire un portefeuille adapté.",
  },
  {
    id: "correlation",
    terme: "Corrélation",
    categorie: "Gestion du risque",
    resume:
      "Lien entre la façon dont deux actifs évoluent ensemble.",
    definition:
      "La corrélation mesure la tendance de deux actifs à évoluer dans le même sens (corrélation positive), en sens inverse (corrélation négative) ou sans lien marqué.",
    avantages: [
      "Permet de mieux diversifier en choisissant des actifs peu corrélés.",
      "Peut réduire les fluctuations globales du portefeuille.",
    ],
    inconvenients: [
      "La corrélation change dans le temps.",
      "En cas de crise majeure, beaucoup d’actifs deviennent corrélés (tout baisse ensemble).",
    ],
    profils: "Investisseurs qui veulent optimiser leur diversification.",
    situations:
      "À considérer lorsque tu ajoutes de nouveaux actifs dans ton portefeuille pour qu’ils n’aillent pas tous exactement dans le même sens.",
  },
  {
    id: "drawdown",
    terme: "Drawdown",
    categorie: "Gestion du risque",
    resume:
      "Baisse maximale entre un plus haut et un plus bas sur une période.",
    definition:
      "Le drawdown correspond à la baisse maximale qu’un portefeuille ou un actif a subie entre un point haut et un point bas sur une période donnée.",
    avantages: [
      "Donne une idée concrète de la pire baisse historique subie.",
      "Aide à voir si tu es prêt psychologiquement à supporter ce type de chute.",
    ],
    inconvenients: [
      "Ne prédit pas le futur : un drawdown passé peut être dépassé.",
      "Peut faire peur si mal interprété.",
    ],
    profils:
      "Investisseurs qui veulent comprendre vraiment le risque de leurs placements.",
    situations:
      "Utile pour comparer des stratégies : une performance similaire avec un drawdown plus faible est souvent préférable.",
  },
  {
    id: "effet-levier",
    terme: "Effet de levier",
    categorie: "Gestion du risque",
    resume:
      "Utilisation de l’endettement pour augmenter la taille d’un investissement.",
    definition:
      "L’effet de levier consiste à emprunter pour investir davantage que ce que ton capital initial permet, ce qui amplifie les gains potentiels, mais aussi les pertes.",
    avantages: [
      "Peut maximiser les gains sur un mouvement favorable.",
      "Permet de prendre des positions plus importantes qu’avec son seul capital.",
    ],
    inconvenients: [
      "Amplifie les pertes et peut entraîner des appels de marge.",
      "Très risqué pour les débutants.",
    ],
    profils:
      "Investisseurs expérimentés, conscients des risques et disposant d’un suivi rigoureux.",
    situations:
      "À éviter dans une logique de long terme pour un particulier débutant. À manipuler avec prudence.",
  },

  
  {
    id: "blockchain",
    terme: "Blockchain",
    categorie: "Crypto & web3",
    resume:
      "Technologie de registre distribué sur laquelle reposent les crypto-monnaies.",
    definition:
      "La blockchain est une base de données distribuée et sécurisée, constituée de blocs de transactions liés entre eux. Elle permet d’enregistrer des informations de manière transparente et difficilement falsifiable.",
    avantages: [
      "Transparence et traçabilité des transactions.",
      "Décentralisation (pas d’acteur unique qui contrôle les données).",
    ],
    inconvenients: [
      "Technologie complexe à comprendre.",
      "Consommation énergétique élevée pour certains protocoles.",
    ],
    profils:
      "Personnes intéressées par les crypto, le Web3 ou les innovations financières.",
    situations:
      "Utile pour comprendre le fonctionnement des crypto-monnaies et certains projets de finance décentralisée (DeFi).",
  },
  {
    id: "wallet-custodial",
    terme: "Wallet custodial",
    categorie: "Crypto & web3",
    resume: "Portefeuille crypto géré par une plateforme.",
    definition:
      "Un wallet custodial est un portefeuille crypto où les clés privées sont détenues par une plateforme (exchange, broker). L’utilisateur n’a pas le contrôle direct de ses clés.",
    avantages: [
      "Plus simple d’utilisation pour les débutants.",
      "Interface souvent proche d’une application bancaire.",
    ],
    inconvenients: [
      "Dépendance à la plateforme.",
      "Risque en cas de faillite ou de piratage de celle-ci.",
    ],
    profils: "Débutants en crypto qui veulent quelque chose de simple.",
    situations:
      "Utile pour une petite exposition crypto sans vouloir gérer soi-même la sécurité des clés privées.",
  },
  {
    id: "wallet-non-custodial",
    terme: "Wallet non custodial",
    categorie: "Crypto & web3",
    resume: "Portefeuille crypto dont tu détiens toi-même les clés.",
    definition:
      "Un wallet non custodial est un portefeuille crypto dans lequel tu détiens et gères toi-même tes clés privées. 'Not your keys, not your coins' : ici, les clés sont bien à toi.",
    avantages: [
      "Contrôle total sur tes crypto-actifs.",
      "Indépendance vis-à-vis des plateformes centralisées.",
    ],
    inconvenients: [
      "Perdre la clé privée = perdre tes fonds.",
      "Responsabilité totale de la sécurité.",
    ],
    profils:
      "Utilisateurs expérimentés en crypto, prêts à gérer la sécurité.",
    situations:
      "Pertinent si tu détiens des montants significatifs en crypto et souhaites vraiment en être propriétaire.",
  },
  {
    id: "cle-privee",
    terme: "Clé privée",
    categorie: "Crypto & web3",
    resume: "Code secret qui permet d’accéder à tes crypto-monnaies.",
    definition:
      "La clé privée est un code cryptographique qui permet de signer des transactions et de prouver que tu es le propriétaire des fonds. À ne jamais partager.",
    avantages: [
      "Preuve de propriété sur tes crypto-actifs.",
      "Permet de signer des transactions sans transmettre ta clé privée.",
    ],
    inconvenients: [
      "Si elle est perdue ou divulguée, tes fonds peuvent être définitivement perdus ou volés.",
    ],
    profils: "Toute personne qui utilise un wallet non custodial.",
    situations:
      "À sécuriser absolument (support physique, phrase de récupération, etc.).",
  },
  {
    id: "exchange",
    terme: "Exchange (plateforme d’échange)",
    categorie: "Crypto & web3",
    resume:
      "Plateforme où tu peux acheter, vendre et échanger des crypto-monnaies.",
    definition:
      "Un exchange est une plateforme en ligne qui permet d’acheter, vendre ou échanger des crypto-monnaies contre d’autres cryptos ou de la monnaie classique.",
    avantages: [
      "Accès facilité aux crypto-monnaies.",
      "Outils de trading et interfaces souvent conviviales.",
    ],
    inconvenients: [
      "Risque de piratage ou de faillite de la plateforme.",
      "Nécessite de faire confiance à un acteur centralisé.",
    ],
    profils:
      "Personnes souhaitant acheter ou vendre des crypto sans gérer toute l’infrastructure.",
    situations:
      "Utilisé pour entrer ou sortir du marché crypto, ou pour échanger une crypto contre une autre.",
  },

  
  {
    id: "plus-value-imposable",
    terme: "Plus-value imposable",
    categorie: "Fiscalité",
    resume: "Gain soumis à l’impôt lors de la vente d’un placement.",
    definition:
      "La plus-value imposable est le gain réalisé lors de la vente d’un actif (actions, ETF, crypto, etc.) et qui est soumis à l’impôt et/ou aux prélèvements sociaux, selon la fiscalité de ton pays.",
    avantages: [
      "Permet de comprendre l’impact fiscal de tes opérations.",
      "Aide à anticiper le montant net réellement perçu.",
    ],
    inconvenients: [
      "Réduit le gain net après impôt.",
      "Peut rendre la fiscalité compliquée si beaucoup d’opérations.",
    ],
    profils: "Investisseurs réalisant des achats/ventes de titres.",
    situations:
      "À considérer lorsque tu arbitres ou réalises des gains importants.",
  },
  {
    id: "pfu-flat-tax",
    terme: "PFU / Flat tax",
    categorie: "Fiscalité",
    resume:
      "Prélèvement forfaitaire sur les gains du capital, selon la loi en vigueur.",
    definition:
      "Le PFU (souvent appelé flat tax) est un prélèvement forfaitaire sur certains revenus du capital (dividendes, plus-values, intérêts), combinant impôt sur le revenu et prélèvements sociaux, selon la législation en place.",
    avantages: [
      "Lisibilité : taux global connu à l’avance.",
      "Évite la complexité de certains barèmes.",
    ],
    inconvenients: [
      "Peut être moins intéressant qu’une imposition au barème dans certains cas.",
      "Reste un coût à intégrer dans ton calcul de performance nette.",
    ],
    profils: "Investisseurs ayant des dividendes, intérêts ou plus-values.",
    situations:
      "À prendre en compte pour estimer ta performance après impôt et comparer des placements.",
  },
];

const categories = [
  "Tous",
  "Comptes & épargne",
  "Comptes d'investissement",
  "Produits financiers",
  "Indicateurs & notions",
  "Gestion du risque",
  "Crypto & web3",
  "Fiscalité",
];

export default function Glossary() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [openedIds, setOpenedIds] = useState([]);

  
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/");
      } else {
        setUserEmail(data.user.email);
      }
    };
    checkUser();
  }, [navigate]);

  
  useEffect(() => {
    const handleBeforeUnload = async () => {
      const remember = localStorage.getItem("olympe_remember_me");
      if (!remember) {
        await supabase.auth.signOut();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  const totalValue = "— €"; 

  const filteredGlossary = useMemo(() => {
    return glossaryData.filter((item) => {
      const matchCategory =
        activeCategory === "Tous" || item.categorie === activeCategory;

      const searchLower = search.toLowerCase();
      const matchSearch =
        item.terme.toLowerCase().includes(searchLower) ||
        item.resume.toLowerCase().includes(searchLower) ||
        item.definition.toLowerCase().includes(searchLower);

      return matchCategory && matchSearch;
    });
  }, [search, activeCategory]);

  const toggleOpen = (id) => {
    setOpenedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">
            OLYMPE
          </p>
          <p className="text-xs text-white/50 -mt-1">
            {userEmail || "Finance dashboard"}
          </p>
        </div>

        
        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem
            icon={Home}
            label="Tableau de bord"
            onClick={() => navigate("/dashboard")}
          />
          <SidebarItem
            icon={Wallet}
            label="Comptes & placements"
            onClick={() => navigate("/accounts")}
          />
          <SidebarItem
            icon={BarChart3}
            label="Analyse"
            onClick={() => navigate("/analyse")}
          />
          <SidebarItem
            icon={PieChart}
            label="Portefeuille"
            onClick={() => navigate("/portefeuille")}
          />
          <SidebarItem
            icon={GraduationCap}
            label="Glossaire"
            active
            onClick={() => navigate("/glossaire")}
          />
          <SidebarItem
            icon={SlidersHorizontal}
            label="Simulation"
            onClick={() => navigate("/simulation")}
          />
          <SidebarItem icon={Bot} label="Assistant IA" onClick={() => navigate("/assistant")} />

        </nav>

        
        <div className="mt-auto px-4 pb-4 space-y-2">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
          >
            <Settings size={16} />
            Paramètres
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
          <p className="text-[10px] text-white/25 mt-2">v0.1 – Olympe</p>
        </div>
      </aside>

      
      <main className="flex-1 flex flex-col overflow-hidden">
        
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              Valeur totale :{" "}
              <span className="font-semibold text-[#D4AF37]">{totalValue}</span>
            </p>
          </div>
        </header>

        
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  Glossaire financier
                </h1>
                <p className="mt-1 text-sm text-gray-500 max-w-xl">
                  Retrouve ici les principaux termes que tu verras dans Olympe,
                  avec des explications simples, les avantages, et dans quelles
                  situations les utiliser.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un terme..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
            </div>

            
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition border ${
                    activeCategory === cat
                      ? "bg-[#D4AF37] border-[#D4AF37] text-white shadow-sm"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {filteredGlossary.length} terme
                {filteredGlossary.length > 1 ? "s" : ""} trouvé
                {filteredGlossary.length > 1 ? "s" : ""}.
              </span>
              <span className="inline-flex items-center gap-1">
                <Info className="h-3 w-3" />
                Clique sur une carte pour afficher les détails.
              </span>
            </div>

            
            {filteredGlossary.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredGlossary.map((item) => {
                  const isOpen = openedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      
                      <button
                        type="button"
                        onClick={() => toggleOpen(item.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-start justify-between gap-3 text-left"
                      >
                        <div>
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                            {item.categorie}
                          </span>
                          <h2 className="mt-2 text-base font-semibold text-gray-900">
                            {item.terme}
                          </h2>
                          
                          <p className="mt-1 text-xs text-gray-500">
                            {item.resume}
                          </p>
                        </div>
                        <div
                          className={`mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-all duration-300 group-hover:bg-[#D4AF37] group-hover:text-white ${
                            isOpen ? "rotate-180 bg-[#D4AF37] text-white" : ""
                          }`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </button>

                      
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-out ${
                          isOpen
                            ? "mt-3 max-h-[800px] opacity-100"
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        <div
                          className={`transform text-xs text-gray-800 transition-transform duration-300 ${
                            isOpen ? "translate-y-0" : "-translate-y-1"
                          }`}
                        >
                          
                          <div className="rounded-lg border-l-4 border-[#D4AF37] bg-[#FFF8E7] px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#D4AF37]">
                              En bref
                            </p>
                            <p className="mt-1 text-gray-800">{item.resume}</p>
                          </div>

                          
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            
                            <div className="space-y-3">
                              <div className="rounded-lg bg-gray-50 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                  Définition
                                </p>
                                <p className="mt-1 text-gray-700">
                                  {item.definition}
                                </p>
                              </div>

                              {item.profils && (
                                <div className="rounded-lg bg-sky-50 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
                                    Pour quel profil ?
                                  </p>
                                  <p className="mt-1 text-gray-700">
                                    {item.profils}
                                  </p>
                                </div>
                              )}
                            </div>

                            
                            <div className="space-y-3">
                              {item.avantages && (
                                <div className="rounded-lg bg-emerald-50 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Avantages
                                  </p>
                                  <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-700">
                                    {item.avantages.map((av, idx) => (
                                      <li key={idx}>{av}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {item.inconvenients && (
                                <div className="rounded-lg bg-rose-50 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                                    Inconvénients
                                  </p>
                                  <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-700">
                                    {item.inconvenients.map((inc, idx) => (
                                      <li key={idx}>{inc}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            
                            {item.situations && (
                              <div className="md:col-span-2 rounded-lg border border-dashed border-[#D4AF37]/40 bg-[#FFFBF2] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#D4AF37]">
                                  Dans quelles situations l'utiliser ?
                                </p>
                                <p className="mt-1 text-gray-800">
                                  {item.situations}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                Aucun terme ne correspond à ta recherche.
                <br />
                Essaie un autre mot-clé ou change de catégorie.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
        active
          ? "bg-white/5 text-white"
          : "text-white/60 hover:bg-white/5 hover:text-white"
      } transition`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
