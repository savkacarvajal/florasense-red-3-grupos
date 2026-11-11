// Grupos de la red, en orden fijo: el orden decide el color de cada grupo (no cambia
// aunque un grupo esté apagado). "id" es el nombre usado en crear-red.sh y en los tópicos
// red/<id>/...; "nombre" es lo que se muestra.
window.RED_CONFIG = {
  grupos: [
    { id: "grupo1", nombre: "Grupo 1" },
    { id: "grupo2", nombre: "Grupo 2" },
    { id: "grupo3", nombre: "Grupo 3" },
  ],
  // Segundos sin datos para marcar un dispositivo como "sin datos"
  segundosSinDatos: 30,
};
